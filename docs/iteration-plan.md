# 06 — Iteration Plan

Ditto listed **iteration** as one of the five things they're evaluating. This doc is how I'd think about v2 and v3 — so the video can end with "here's what I'd ship next Monday" and sound credible.

## v1 (what I'm shipping in 90–120 min)

- Single-page chat with streaming
- One agent, four tools
- Postgres with 20 seeded mock profiles
- Deployed on Vercel
- Accept / reject loop with feedback capture

**Honest v1 limitations I'll call out in the video:**
- No auth — one implicit user
- Mock pool, not real users
- No actual date scheduling (the "Tuesday 7pm" is LLM-generated text, not a calendar invite)
- No safety filters on preference text
- Single agent, not the 4-agent architecture Ditto runs in production

## v2 — one week of work

The theme: **make it real.**

### 1. Multi-agent split (1.5 days)
Replace the single agent with four, orchestrated via Claude's tool use across sessions:
- **Analysis Agent** — deep preference extraction, including implicit signals ("I hated my last date because he wouldn't stop talking about crypto" → `avoiding: finance_culture`, `wants: good_listener`)
- **Matchmaker Agent** — scores candidates against the brief with explicit reasoning traces
- **Scheduler Agent** — proposes venue + time based on both users' availability
- **Poster Agent** — generates the personalized date card (the "shared hook" sentence)

Each agent is a separate Claude conversation with its own system prompt, sharing state via Postgres. I'd keep it in the same repo — no microservices, no extra infra.

### 2. Real user auth (0.5 days)
Clerk or Auth.js. Email + phone (because iMessage is the endgame). Users get a row in `users`, not a hardcoded one.

### 3. Intake as onboarding flow (1 day)
First-time user gets a longer, multi-turn intake — values, availability, non-negotiables. Saves a durable profile. Subsequent "what should we do this week" sessions are shorter updates on top.

### 4. Real match pool (1 day)
Pool of real users. When user A is proposed to user B, both must consent before any contact info is revealed.

### 5. Observability (0.5 days)
Log every tool call, every rejection, every acceptance. PostHog or Axiom. This is the data that tells me if the matching is actually working — Ditto's 20% conversion rate is their north star metric and I need to be able to measure my version of it.

### 6. Safety and abuse (0.5 days)
Content moderation on preference text (Claude's moderation tools). Flag users who submit preferences that describe minors, target specific individuals, or express clearly unsafe intent.

### 7. Evaluation harness (1 day)
A set of 30 "golden" preference inputs with expected extraction behavior. Run them on every PR. This is the only way to catch regressions when you tune the system prompt.

## v3 — one month out

The theme: **iMessage.**

- **Twilio or Sendblue integration** so the experience lives where Ditto actually lives. Web UI becomes a backup / admin surface.
- **Wednesday 7pm batch job** that runs matches across the whole pool and fires out one iMessage per user. This is the real Ditto rhythm.
- **Post-date feedback** — survey sent 24h after the proposed date time. Responses feed directly into the preference model.
- **pgvector for semantic search** on the match pool when it hits 5K+ users.
- **A/B testing framework** for system prompts — hold out 10% of users on the previous prompt, measure conversion delta.

## v4 — thinking like a founder

The theme: **beyond dating.**

Ditto's founders have said they want to be "a matchmaker for modern life" — finding co-founders, mentors, frisbee groups. The infrastructure I'm building is exactly the same: preference intake → pool search → proposed one-on-one → feedback loop. The domain just changes.

- **Ditto Professional** — same engine, matched for coffee chats between founders and operators.
- **Ditto Groups** — five-person dinner parties instead of one-on-one dates.
- **Ditto Events** — the yacht party product, but orchestrated by the same agent stack.

## What I'd *not* build, even if asked

- **A photo-based browse feed.** That's the product Ditto is explicitly replacing.
- **Chat between matched users before the date.** Anti-pattern; the whole thesis is "no chat, show up."
- **Gamification / streaks / daily-engagement mechanics.** Their business model is outcomes, not time-on-app. Everything about the product should push users *out* of the product.

## How I'd measure success for each iteration

| Version | North-star metric | Guardrail metric |
|---|---|---|
| v1 (this build) | Does a stranger in the video understand what the feature does? | Latency under 3s to first token |
| v2 | Rejection → acceptance conversion within a session (how well does the feedback loop work?) | Number of tool-call errors per session |
| v3 | % of proposed dates that become confirmed attendances | % of users who reply to the post-date survey |
| v4 | Same-domain conversion (dating: dates happened; networking: coffees happened) | Cross-domain user retention |

## The one-line iteration philosophy

**Ship thin. Measure outcomes. Iterate on the weakest link in the funnel, not the most visible one.**
