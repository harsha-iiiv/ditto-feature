"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Role = "user" | "assistant";

type Message = {
  id: string;
  role: Role;
  text: string;
};

type Proposal = {
  date_id: string;
  match?: {
    name?: string | null;
    age?: number | null;
    major?: string | null;
    bio_blurb?: string | null;
  };
  plan?: {
    venue?: string | null;
    scheduled_at?: string | null;
    shared_hook?: string | null;
    status?: string | null;
  };
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: crypto.randomUUID(),
      role: "assistant",
      text: "Hey, I'm Cupid. Tell me who you'd want Ditto to set you up with this week. Be as picky as you want.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [activeProposal, setActiveProposal] = useState<Proposal | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, toolActivity, activeProposal, statusMessage, errorMessage]);

  const canShowProposalActions = useMemo(
    () => Boolean(activeProposal?.date_id) && !busy,
    [activeProposal?.date_id, busy],
  );

  async function sendMessage(rawMessage: string) {
    const userMessage = rawMessage.trim();
    if (!userMessage || busy) return;

    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    setToolActivity(null);
    setActiveProposal(null);
    setInput("");

    const placeholderId = crypto.randomUUID();
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: userMessage },
      { id: placeholderId, role: "assistant", text: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, sessionId }),
      });

      if (!res.ok || !res.body) {
        throw new Error("The chat stream did not start.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedTerminalEvent = false;
      let receivedAssistantText = false;

      const applyPayload = (
        payload:
          | { type: "done" | "error"; message?: string }
          | { type: "text"; delta: string }
          | { type: "tool"; name: string }
          | { type: "proposal"; proposal: Proposal },
      ) => {
        if (payload.type === "text") {
          receivedAssistantText = true;
          setMessages((current) =>
            current.map((message) =>
              message.id === placeholderId
                ? { ...message, text: message.text + payload.delta }
                : message,
            ),
          );
        }

        if (payload.type === "tool") {
          setToolActivity(prettyToolName(payload.name));
        }

        if (payload.type === "proposal") {
          setActiveProposal(payload.proposal);
        }

        if (payload.type === "error") {
          receivedTerminalEvent = true;
          throw new Error(payload.message ?? "Something went wrong.");
        }

        if (payload.type === "done") {
          receivedTerminalEvent = true;
        }
      };

      const processChunks = (rawChunkBlock: string) => {
        const chunks = rawChunkBlock.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          const payload = JSON.parse(chunk.slice(6)) as
            | { type: "done" | "error"; message?: string }
            | { type: "text"; delta: string }
            | { type: "tool"; name: string }
            | { type: "proposal"; proposal: Proposal };

          applyPayload(payload);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        processChunks(buffer + decoder.decode(value, { stream: true }));
      }

      const trailingText = decoder.decode();
      if (trailingText) {
        processChunks(buffer + trailingText);
      } else if (buffer.trim().startsWith("data: ")) {
        applyPayload(JSON.parse(buffer.trim().slice(6)));
        buffer = "";
      }

      if (!receivedAssistantText) {
        setMessages((current) =>
          current.map((message) =>
            message.id === placeholderId
              ? {
                  ...message,
                  text: "Cupid lost the thread on that one. Try the same note again or tweak the feedback a little.",
                }
              : message,
          ),
        );
      }

      setBusy(false);
      setToolActivity(null);
      if (!receivedTerminalEvent) {
        setStatusMessage(null);
      }
    } catch (error) {
      setBusy(false);
      setToolActivity(null);
      setActiveProposal(null);
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  async function acceptProposal() {
    if (!activeProposal?.date_id) return;

    const res = await fetch(`/api/dates/${activeProposal.date_id}/accept`, {
      method: "POST",
    });

    if (!res.ok) {
      setErrorMessage("Couldn't confirm the date just yet.");
      return;
    }

    setStatusMessage("Locked in. Cupid marked this one as accepted.");
    setActiveProposal(null);
  }

  async function rejectProposal() {
    if (!activeProposal?.date_id) return;

    const reason = window.prompt("What felt off about this one?");
    if (!reason?.trim()) return;

    await fetch(`/api/dates/${activeProposal.date_id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });

    await sendMessage(
      `Not for me. The last proposed date_id was ${activeProposal.date_id}. Reason: ${reason}. Please propose someone else.`,
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-8">
      <section className="glass-panel flex min-h-[84vh] flex-col overflow-hidden rounded-[2rem]">
        <header className="border-b border-[var(--line)] px-5 py-4 sm:px-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-[var(--muted)]">
                Ditto Demo
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Cupid
              </h1>
            </div>
            <div className="rounded-full border border-[var(--line)] bg-white/75 px-3 py-2 text-right">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Meet someone real this week
              </p>
              <p className="text-xs text-[var(--muted)]">
                Preference intake, match reasoning, one date at a time
              </p>
            </div>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {messages.map((message) => (
              <Bubble key={message.id} role={message.role} text={message.text} />
            ))}

            {toolActivity ? (
              <p className="px-2 text-sm italic text-[var(--muted)]">
                {toolActivity}...
              </p>
            ) : null}

            {canShowProposalActions ? (
              <div className="rounded-[1.5rem] border border-[var(--line)] bg-white/85 p-4 shadow-[0_18px_40px_rgba(36,53,84,0.1)]">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Proposed match
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {activeProposal?.match?.name ?? "Someone promising"} at{" "}
                  {activeProposal?.plan?.venue ?? "a campus spot"} on{" "}
                  {formatDate(activeProposal?.plan?.scheduled_at)}.
                </p>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={acceptProposal}
                    className="rounded-full bg-[var(--bubble-user)] px-5 py-3 font-medium text-white shadow-[0_12px_28px_var(--bubble-user-shadow)] transition hover:brightness-105"
                  >
                    Sounds good
                  </button>
                  <button
                    type="button"
                    onClick={rejectProposal}
                    className="rounded-full border border-[var(--line)] bg-white px-5 py-3 font-medium text-[var(--foreground)] transition hover:bg-slate-50"
                  >
                    Not for me
                  </button>
                </div>
              </div>
            ) : null}

            {statusMessage ? (
              <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {statusMessage}
              </p>
            ) : null}

            {errorMessage ? (
              <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="border-t border-[var(--line)] bg-white/65 px-4 py-4 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-[1.7rem] border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-[0_14px_30px_rgba(31,47,79,0.09)]">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <textarea
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(input);
                    }
                  }}
                  disabled={busy}
                  placeholder="someone who reads actual books, not self-help..."
                  className="min-h-28 flex-1 resize-none rounded-[1.2rem] bg-transparent px-4 py-3 text-[15px] leading-6 text-[var(--foreground)] outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => void sendMessage(input)}
                  disabled={busy || !input.trim()}
                  className="flex h-12 items-center justify-center rounded-full bg-[var(--accent)] px-5 font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {busy ? "Thinking..." : "Send"}
                </button>
              </div>
            </div>
          </div>
        </footer>
      </section>
    </main>
  );
}

function Bubble({ role, text }: { role: Role; text: string }) {
  const isUser = role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] rounded-[1.45rem] px-4 py-3 text-[15px] leading-6 shadow-[0_10px_30px_rgba(34,50,78,0.08)] sm:max-w-[78%] ${
          isUser
            ? "rounded-br-md bg-[var(--bubble-user)] text-white"
            : "rounded-bl-md bg-[var(--bubble-assistant)] text-[var(--foreground)]"
        }`}
      >
        {text ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[var(--muted)]">
            <span className="h-2 w-2 animate-pulse rounded-full bg-current" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
          </span>
        )}
      </div>
    </div>
  );
}

function prettyToolName(name: string) {
  const labels: Record<string, string> = {
    extract_preferences: "Understanding your type",
    search_match_pool: "Scanning the pool",
    propose_date_plan: "Planning the date",
    record_feedback: "Tuning the next match",
  };

  return labels[name] ?? "Thinking";
}

function formatDate(value?: string | null) {
  if (!value) return "next Tuesday at 7pm";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
