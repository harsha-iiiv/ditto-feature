# Ditto — Preference Intake → Match Reasoning → Date Plan

**Live demo:** https://ditto-v1.vercel.app

A conversational feature that replaces "browse + swipe" with a single AI-planned date proposal. The user describes who they want in natural language; Cupid extracts structured preferences, scores a pool of candidates, and proposes one concrete date. Every rejection feeds back into the next proposal.

---

## Try it

Open **https://ditto-v1.vercel.app** and copy/paste the prompts below.

### 1. Happy path

Paste this into the chat:

```
someone who reads actual books, not self-help. bonus if they play an instrument. no finance bros please.
```

What happens:
- Cupid extracts a structured preference brief from your free-form message
- Scores 20 mock UC Berkeley profiles against your brief
- Proposes one match, one venue, and one time
- UI shows **Sounds good** and **Not for me**

### 2. Rejection loop

Click **Not for me**, then paste one of these as the reason:

```
too artsy. i want someone more intellectual and easier to talk to.
```
```
i want someone more outdoorsy and less thesis-heavy.
```
```
good on paper, but i want someone warmer and less intense.
```

What happens:
- The proposal is marked rejected in Postgres
- Rejection signals (`add_avoiding`, `add_looking_for`) are extracted and stored
- Cupid proposes a different person — the rejected match is permanently excluded for this session

### 3. More opening prompts to try

```
someone outdoorsy and grounded. not too online. ideally likes long walks and coffee.
```
```
i want someone thoughtful, a little indie, probably a reader, but not overly intense.
```
```
looking for someone ambitious and social, but not finance culture and not gym-maxing.
```

---

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router + Tailwind 4 |
| AI | Gemini 2.5 Flash via `@google/genai` — structured JSON extraction + streaming |
| DB | Neon Postgres via `postgres` (porsager) |
| Hosting | Vercel |

## Architecture

One API route (`/api/chat`) handles the full agent loop:

```
User message
  → [Gemini] extract_preferences → structured brief
  → [SQL] search_match_pool → scored candidates
  → [SQL] propose_date_plan → saved proposal
  → [Gemini] stream natural-language summary → UI
```

On rejection:

```
Rejection reason
  → [Gemini] parse_feedback → add_avoiding / add_looking_for signals
  → [SQL] record_rejection_feedback → mark date rejected
  → [SQL] search_match_pool (excluding all previously rejected matches)
  → propose again
```

## Running locally

```bash
cp .env.local.example .env.local   # set GEMINI_API_KEY and DATABASE_URL
npm install
npm run db:init                     # create tables
npm run seed                        # 20 mock profiles
npm run dev
```

## Key files

| File | What it does |
|---|---|
| `app/page.tsx` | Full chat UI — bubbles, streaming, proposal card, accept/reject |
| `app/api/chat/route.ts` | Core agent loop with SSE streaming |
| `lib/matchmaking.ts` | Tag scoring, preference storage, proposal creation |
| `lib/gemini.ts` | Thin Gemini client wrapper |
| `db/schema.sql` | 5-table schema |
| `scripts/seed.ts` | 20 UC Berkeley mock profiles |
| `files/` | Planning docs — customer research, architecture, iteration plan |

## Iteration plan

See [`docs/iteration-plan.md`](docs/iteration-plan.md) for v2 (multi-agent split, real auth, real pool) and v3 (iMessage bridge via Sendblue).
