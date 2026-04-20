# Ditto — Preference Intake → Match Reasoning → Date Plan

**Live demo:** https://ditto-v1-i9n2cmxjx-harshas-projects-1ac46ddf.vercel.app

A conversational feature that replaces "browse + swipe" with a single AI-planned date proposal. The user describes who they want in natural language; Cupid extracts structured preferences, scores a pool of candidates, and proposes one concrete date. Every rejection feeds back into the next proposal.

Built as a take-home feature for the Ditto internship assessment. Full planning context in [`files/`](files/).

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

See [`files/06-iteration-plan.md`](files/06-iteration-plan.md) for v2 (multi-agent split, real auth, real pool) and v3 (iMessage bridge via Sendblue).
