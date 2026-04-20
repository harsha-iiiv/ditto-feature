import { FunctionTool } from "@google/adk";
import { Type } from "@google/genai";
import { sql } from "./db";

type MatchRow = {
  id: string;
  name: string;
  age: number | null;
  major: string | null;
  vibe_tags: string[] | null;
  bio_blurb: string | null;
  campus: string | null;
};

const DEMO_USER_NAME = "Demo User";
const DEMO_CAMPUS = "UC Berkeley";

export const extractPreferences = new FunctionTool({
  name: "extract_preferences",
  description:
    "Parse the user's free-form description into structured dating preferences. Save the brief and return its id.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      raw_input: { type: Type.STRING, description: "The user's original free-form message." },
      looking_for: {
        type: Type.ARRAY,
        description: "Positive traits or interests.",
        items: { type: Type.STRING },
      },
      avoiding: {
        type: Type.ARRAY,
        description: "Traits or vibes to avoid.",
        items: { type: Type.STRING },
      },
      must_haves: {
        type: Type.ARRAY,
        description: "Non-negotiable preferences.",
        items: { type: Type.STRING },
      },
      vibe: {
        type: Type.STRING,
        description: "A one-sentence summary of the overall vibe the user wants.",
      },
    },
    required: ["raw_input", "looking_for", "avoiding", "must_haves", "vibe"],
  },
  execute: async (input, context) => {
    const { raw_input, looking_for, avoiding, must_haves, vibe } = input as {
      avoiding: string[];
      looking_for: string[];
      must_haves: string[];
      raw_input: string;
      vibe: string;
    };
    const userId = await getOrCreateDemoUser();
    const [row] = await sql`
      INSERT INTO preference_briefs (user_id, raw_input, looking_for, avoiding, must_haves, vibe)
      VALUES (${userId}, ${raw_input}, ${looking_for}, ${avoiding}, ${must_haves}, ${vibe})
      RETURNING id
    `;

    context?.state.set("current_brief_id", row.id);
    context?.state.set("current_raw_input", raw_input);

    return { brief_id: row.id, status: "success", vibe };
  },
});

export const searchMatchPool = new FunctionTool({
  name: "search_match_pool",
  description:
    "Search the mock pool using positive and negative vibe tags. Returns up to three strong candidates.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      positive_tags: {
        type: Type.ARRAY,
        description: "Tags the match should have. These should overlap with mock_pool.vibe_tags.",
        items: { type: Type.STRING },
      },
      negative_tags: {
        type: Type.ARRAY,
        description: "Tags to exclude.",
        items: { type: Type.STRING },
      },
      limit: {
        type: Type.INTEGER,
        description: "Number of candidates to return.",
      },
    },
    required: ["positive_tags"],
  },
  execute: async (input, context) => {
    const {
      limit = 3,
      negative_tags = [],
      positive_tags,
    } = input as {
      limit?: number;
      negative_tags?: string[];
      positive_tags: string[];
    };
    const seenMatchIds = context?.state.get("seen_match_ids", []) as string[];
    const candidates = await sql<MatchRow[]>`
      SELECT id, name, age, major, vibe_tags, bio_blurb, campus
      FROM mock_pool
      WHERE campus = ${DEMO_CAMPUS}
    `;

    const normalizedPositive = positive_tags.map(normalizeTag);
    const normalizedNegative = negative_tags.map(normalizeTag);

    const ranked = candidates
      .filter((candidate) => !seenMatchIds.includes(candidate.id))
      .map((candidate) => {
        const tags = (candidate.vibe_tags ?? []).map(normalizeTag);
        const positives = normalizedPositive.filter((tag) => tags.includes(tag)).length;
        const negatives = normalizedNegative.filter((tag) => tags.includes(tag)).length;
        return { candidate, score: positives * 3 - negatives * 4 };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ candidate }) => candidate);

    return { candidates: ranked, status: "success" };
  },
});

export const proposeDatePlan = new FunctionTool({
  name: "propose_date_plan",
  description:
    "Create one concrete date plan for the best candidate, including venue, time, and shared hook.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      brief_id: { type: Type.STRING, description: "UUID for the stored preference brief." },
      match_id: { type: Type.STRING, description: "UUID for the selected match." },
      venue: {
        type: Type.STRING,
        description: 'Specific venue, e.g. "Philz Coffee on College Ave".',
      },
      scheduled_at: {
        type: Type.STRING,
        description: "ISO 8601 datetime for the proposed date.",
      },
      shared_hook: {
        type: Type.STRING,
        description: "One sentence explaining the shared interest or vibe fit.",
      },
    },
    required: ["brief_id", "match_id", "venue", "scheduled_at", "shared_hook"],
  },
  execute: async (input, context) => {
    const { brief_id, match_id, venue, scheduled_at, shared_hook } = input as {
      brief_id: string;
      match_id: string;
      scheduled_at: string;
      shared_hook: string;
      venue: string;
    };
    const [row] = await sql`
      INSERT INTO proposed_dates (brief_id, match_id, venue, scheduled_at, shared_hook)
      VALUES (${brief_id}, ${match_id}, ${venue}, ${scheduled_at}, ${shared_hook})
      RETURNING id, venue, scheduled_at, shared_hook, status
    `;

    const [match] = await sql<MatchRow[]>`
      SELECT id, name, age, major, vibe_tags, bio_blurb, campus
      FROM mock_pool
      WHERE id = ${match_id}
    `;

    const seenMatchIds = context?.state.get("seen_match_ids", []) as string[];
    context?.state.set("current_brief_id", brief_id);
    context?.state.set("current_date_id", row.id);
    context?.state.set("current_match_id", match_id);
    context?.state.set("seen_match_ids", Array.from(new Set([...seenMatchIds, match_id])));

    return {
      date_id: row.id,
      match,
      plan: row,
      status: "success",
    };
  },
});

export const recordFeedback = new FunctionTool({
  name: "record_feedback",
  description:
    "Record why the user rejected the last proposal and save structured signals for the next attempt.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      date_id: { type: Type.STRING, description: "UUID of the rejected proposal." },
      reason: { type: Type.STRING, description: "The user's free-form rejection reason." },
      parsed_signal: {
        type: Type.ARRAY,
        description: "Structured tags extracted from the reason.",
        items: { type: Type.STRING },
      },
    },
    required: ["date_id", "reason", "parsed_signal"],
  },
  execute: async (input, context) => {
    const { date_id, reason, parsed_signal } = input as {
      date_id: string;
      parsed_signal: string[];
      reason: string;
    };
    await sql`
      UPDATE proposed_dates
      SET status = 'rejected'
      WHERE id = ${date_id}
    `;

    const [row] = await sql`
      INSERT INTO rejection_feedback (date_id, reason, parsed_signal)
      VALUES (${date_id}, ${reason}, ${parsed_signal})
      RETURNING id
    `;

    context?.state.set("last_feedback_reason", reason);
    context?.state.set("last_feedback_signal", parsed_signal);

    return { feedback_id: row.id, status: "success" };
  },
});

async function getOrCreateDemoUser(): Promise<string> {
  const existing = await sql<{ id: string }[]>`
    SELECT id FROM users WHERE name = ${DEMO_USER_NAME} LIMIT 1
  `;

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO users (name, campus)
    VALUES (${DEMO_USER_NAME}, ${DEMO_CAMPUS})
    RETURNING id
  `;

  return row.id;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase();
}
