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
  const [rejectionInput, setRejectionInput] = useState("");
  const [showRejectionInput, setShowRejectionInput] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const rejectionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, toolActivity, activeProposal, statusMessage, errorMessage, showRejectionInput]);

  useEffect(() => {
    if (showRejectionInput) {
      rejectionRef.current?.focus();
    }
  }, [showRejectionInput]);

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

  function openRejectionInput() {
    setShowRejectionInput(true);
    setRejectionInput("");
  }

  async function submitRejection() {
    const reason = rejectionInput.trim();
    if (!reason || !activeProposal?.date_id) return;

    setShowRejectionInput(false);
    setRejectionInput("");

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
    <main className="flex h-dvh w-full flex-col overflow-hidden sm:items-center sm:justify-center sm:p-4 sm:py-6">
      <section className="glass-panel flex h-full w-full flex-col overflow-hidden sm:h-[92vh] sm:max-w-2xl sm:rounded-[2rem]">
        <header className="flex-shrink-0 border-b border-[var(--line)] px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">
                Ditto Demo
              </p>
              <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                Cupid
              </h1>
            </div>
            <p className="text-right text-xs leading-5 text-[var(--muted)] sm:text-sm">
              One date at a time,<br className="sm:hidden" /> go or don&apos;t go
            </p>
          </div>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5"
        >
          <div className="flex flex-col gap-3">
            {messages.map((message) => (
              <Bubble key={message.id} role={message.role} text={message.text} />
            ))}

            {toolActivity ? (
              <p className="px-1 text-sm italic text-[var(--muted)]">
                {toolActivity}...
              </p>
            ) : null}

            {canShowProposalActions ? (
              <div className="rounded-2xl border border-[var(--line)] bg-white/90 p-4 shadow-[0_12px_32px_rgba(36,53,84,0.1)]">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Proposed match
                </p>
                <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                  <span className="font-medium">{activeProposal?.match?.name ?? "Someone promising"}</span>
                  {activeProposal?.match?.major ? ` · ${activeProposal.match.major}` : ""}
                </p>
                <p className="text-sm text-[var(--muted)]">
                  {activeProposal?.plan?.venue ?? "a campus spot"} · {formatDate(activeProposal?.plan?.scheduled_at)}
                </p>
                {activeProposal?.plan?.shared_hook ? (
                  <p className="mt-2 text-sm italic text-[var(--muted)]">
                    &ldquo;{activeProposal.plan.shared_hook}&rdquo;
                  </p>
                ) : null}

                {showRejectionInput ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      ref={rejectionRef}
                      type="text"
                      value={rejectionInput}
                      onChange={(e) => setRejectionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void submitRejection();
                        if (e.key === "Escape") setShowRejectionInput(false);
                      }}
                      placeholder="What felt off?"
                      className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm text-[var(--foreground)] outline-none placeholder:text-slate-400 focus:border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => void submitRejection()}
                      disabled={!rejectionInput.trim()}
                      className="rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void acceptProposal()}
                      className="flex-1 rounded-full bg-[var(--bubble-user)] py-3 text-sm font-medium text-white shadow-[0_8px_20px_var(--bubble-user-shadow)] transition active:brightness-95 sm:hover:brightness-105"
                    >
                      Sounds good
                    </button>
                    <button
                      type="button"
                      onClick={openRejectionInput}
                      className="flex-1 rounded-full border border-[var(--line)] bg-white py-3 text-sm font-medium text-[var(--foreground)] transition active:bg-slate-50 sm:hover:bg-slate-50"
                    >
                      Not for me
                    </button>
                  </div>
                )}
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

        <footer className="flex-shrink-0 border-t border-[var(--line)] bg-white/70 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-end gap-2 rounded-[1.4rem] border border-[var(--line)] bg-[var(--surface-strong)] p-2 shadow-[0_8px_24px_rgba(31,47,79,0.08)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              disabled={busy}
              rows={1}
              placeholder="someone who reads actual books, not self-help..."
              className="flex-1 resize-none overflow-hidden rounded-[1rem] bg-transparent px-3 py-2.5 text-[15px] leading-6 text-[var(--foreground)] outline-none placeholder:text-slate-400"
              style={{ minHeight: "42px" }}
            />
            <button
              type="button"
              onClick={() => void sendMessage(input)}
              disabled={busy || !input.trim()}
              className="mb-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_4px_12px_rgba(255,122,89,0.35)] transition active:brightness-95 disabled:cursor-not-allowed disabled:opacity-50 sm:hover:brightness-105"
              aria-label="Send"
            >
              {busy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              )}
            </button>
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
        className={`max-w-[85%] rounded-[1.3rem] px-4 py-2.5 text-[15px] leading-6 shadow-[0_6px_20px_rgba(34,50,78,0.07)] ${
          isUser
            ? "rounded-br-md bg-[var(--bubble-user)] text-white"
            : "rounded-bl-md bg-[var(--bubble-assistant)] text-[var(--foreground)]"
        }`}
      >
        {text ? (
          <span className="whitespace-pre-wrap">{text}</span>
        ) : (
          <span className="inline-flex items-center gap-1 py-0.5 text-[var(--muted)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
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
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}
