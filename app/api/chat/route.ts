import { Type } from "@google/genai";
import { ai } from "@/lib/gemini";
import {
  createPreferenceBrief,
  createProposedDate,
  findBriefByDateId,
  getRejectedMatchIds,
  recordRejectionFeedback,
  searchMatchPoolDeterministic,
} from "@/lib/matchmaking";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json();
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "Message is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = performance.now();
      try {
        const sendEvent = (payload: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };

        const logPhase = (phase: string, phaseStartedAt: number, extra?: object) => {
          console.info("[Cupid timing]", {
            elapsed_ms: Math.round(performance.now() - phaseStartedAt),
            phase,
            ...extra,
          });
        };

        const rejectionMatch = message.match(
          /last proposed date_id was ([0-9a-f-]{36})\.\s*reason:\s*(.+?)\.?\s*please propose someone else\.?$/i,
        );

        let briefId = "";
        let candidate: Awaited<ReturnType<typeof searchMatchPoolDeterministic>>[number]["candidate"] | null =
          null;
        let preferredTags: string[] = [];
        let preferredVibe = "";

        if (rejectionMatch) {
          sendEvent({ type: "tool", name: "record_feedback" });
          const phaseStartedAt = performance.now();

          const dateId = rejectionMatch[1];
          const reason = rejectionMatch[2].trim();
          const context = await findBriefByDateId(dateId);

          if (!context) {
            throw new Error("Could not find the earlier proposal to refine.");
          }

          const feedbackResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: [
                      "You are parsing rejection feedback for a dating matchmaker.",
                      "Return JSON only.",
                      "Use short tag-like strings.",
                      `Original brief vibe: ${context.brief.vibe ?? ""}`,
                      `Original looking_for: ${(context.brief.looking_for ?? []).join(", ")}`,
                      `Original avoiding: ${(context.brief.avoiding ?? []).join(", ")}`,
                      `Rejected match: ${context.match.name} - ${context.match.major ?? ""} - ${context.match.bio_blurb ?? ""}`,
                      `User rejection reason: ${reason}`,
                      "Infer:",
                      "- parsed_signal: concise tags for what went wrong",
                      "- add_looking_for: tags to increase in the next search",
                      "- add_avoiding: tags to avoid in the next search",
                      "- vibe_adjustment: one short sentence describing the adjustment",
                    ].join("\n"),
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  add_avoiding: { type: Type.ARRAY, items: { type: Type.STRING } },
                  add_looking_for: { type: Type.ARRAY, items: { type: Type.STRING } },
                  parsed_signal: { type: Type.ARRAY, items: { type: Type.STRING } },
                  vibe_adjustment: { type: Type.STRING },
                },
                required: ["parsed_signal", "add_looking_for", "add_avoiding", "vibe_adjustment"],
              },
            },
          });

          const feedback = JSON.parse(feedbackResponse.text ?? "{}") as {
            add_avoiding: string[];
            add_looking_for: string[];
            parsed_signal: string[];
            vibe_adjustment: string;
          };

          await recordRejectionFeedback({
            add_avoiding: feedback.add_avoiding,
            add_looking_for: feedback.add_looking_for,
            date_id: dateId,
            parsed_signal: feedback.parsed_signal,
            reason,
          });

          logPhase("parse_feedback", phaseStartedAt, {
            date_id: dateId,
            parsed_signal: feedback.parsed_signal,
          });

          sendEvent({ type: "tool", name: "search_match_pool" });
          const searchStartedAt = performance.now();
          briefId = context.brief.id;
          preferredVibe = feedback.vibe_adjustment || context.brief.vibe || "";
          preferredTags = [
            ...(context.brief.looking_for ?? []),
            ...feedback.add_looking_for,
          ];
          const negativeTags = [
            ...(context.brief.avoiding ?? []),
            ...feedback.add_avoiding,
            ...feedback.parsed_signal,
          ];

          const rejectedMatchIds = await getRejectedMatchIds(context.brief.id);
          const ranked = await searchMatchPoolDeterministic({
            excludedMatchIds: rejectedMatchIds,
            negativeTags,
            positiveTags: preferredTags,
            preferredVibe,
          });

          candidate = ranked[0]?.candidate ?? null;
          logPhase("search_match_pool", searchStartedAt, {
            candidate_count: ranked.length,
            rejected_count: rejectedMatchIds.length,
          });
        } else {
          sendEvent({ type: "tool", name: "extract_preferences" });
          const phaseStartedAt = performance.now();

          const extractionResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: [
                      "You are extracting dating preferences for a college matchmaker.",
                      "Return JSON only.",
                      "Map preferences into concise tags that fit this tag universe when relevant:",
                      "literary, musical, indie, intellectual, coffee, reader, outdoorsy, hiker, sustainable, artsy, museums, film, composer, science, runner, tech, builder, athletic, thoughtful, social, ambitious, finance_culture.",
                      "Prefer tags from that list over novel tags unless a must-have or avoid is clearly outside it.",
                      `User message: ${message}`,
                    ].join("\n"),
                  },
                ],
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  avoiding: { type: Type.ARRAY, items: { type: Type.STRING } },
                  looking_for: { type: Type.ARRAY, items: { type: Type.STRING } },
                  must_haves: { type: Type.ARRAY, items: { type: Type.STRING } },
                  raw_input: { type: Type.STRING },
                  vibe: { type: Type.STRING },
                },
                required: ["raw_input", "looking_for", "avoiding", "must_haves", "vibe"],
              },
            },
          });

          const extracted = JSON.parse(extractionResponse.text ?? "{}") as {
            avoiding: string[];
            looking_for: string[];
            must_haves: string[];
            raw_input: string;
            vibe: string;
          };

          const brief = await createPreferenceBrief(extracted);
          briefId = brief.brief_id;
          preferredTags = extracted.looking_for;
          preferredVibe = extracted.vibe;

          logPhase("extract_preferences", phaseStartedAt, {
            avoiding: extracted.avoiding,
            brief_id: briefId,
            looking_for: extracted.looking_for,
          });

          sendEvent({ type: "tool", name: "search_match_pool" });
          const searchStartedAt = performance.now();
          const ranked = await searchMatchPoolDeterministic({
            negativeTags: extracted.avoiding,
            positiveTags: extracted.looking_for,
            preferredVibe: extracted.vibe,
          });
          candidate = ranked[0]?.candidate ?? null;
          logPhase("search_match_pool", searchStartedAt, {
            candidate_count: ranked.length,
          });
        }

        if (!candidate) {
          sendEvent({
            type: "text",
            delta:
              "I’m not seeing a clean fit in the pool yet. Give me one more sentence about the vibe you want and I’ll tighten the search.",
          });
          sendEvent({ type: "done" });
          controller.close();
          return;
        }

        sendEvent({ type: "tool", name: "propose_date_plan" });
        const proposalStartedAt = performance.now();
        const proposal = await createProposedDate({
          briefId,
          match: candidate,
          preferredTags,
        });
        sendEvent({ type: "proposal", proposal });
        logPhase("propose_date_plan", proposalStartedAt, { date_id: proposal.date_id });

        const copyStartedAt = performance.now();
        const responseStream = await ai.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: [
                    "You are Cupid, a warm, concise campus matchmaker.",
                    "Write exactly one short paragraph, around 45 to 70 words.",
                    'Mention the match name, one concrete detail from their bio, the venue, the time, and the shared hook. End with the exact sentence: "Sound good, or not for me?"',
                    "Do not use bullet points. Do not mention profiles. Do not mention tools.",
                    `Match name: ${proposal.match.name}`,
                    `Match bio: ${proposal.match.bio_blurb ?? ""}`,
                    `Major: ${proposal.match.major ?? ""}`,
                    `Venue: ${proposal.plan.venue}`,
                    `Scheduled at: ${proposal.plan.scheduled_at}`,
                    `Shared hook: ${proposal.plan.shared_hook}`,
                    `User vibe: ${preferredVibe}`,
                  ].join("\n"),
                },
              ],
            },
          ],
        });

        for await (const chunk of responseStream) {
          if (chunk.text) {
            sendEvent({ type: "text", delta: chunk.text });
          }
        }

        logPhase("stream_final_copy", copyStartedAt, {
          total_elapsed_ms: Math.round(performance.now() - startedAt),
        });

        sendEvent({ type: "done" });
        controller.close();
      } catch (error) {
        console.error("Chat stream error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  });
}
