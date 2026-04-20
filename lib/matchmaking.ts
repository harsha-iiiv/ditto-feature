import { sql } from "./db";

const DEMO_USER_NAME = "Demo User";
const DEMO_CAMPUS = "UC Berkeley";
const TAG_ALIASES: Record<string, string> = {
  athlete: "athletic",
  bookish: "literary",
  books: "reader",
  buildery: "builder",
  coffeehouse: "coffee",
  composing: "composer",
  contemplative: "thoughtful",
  cultured: "artsy",
  film_scene: "film",
  finance: "finance_culture",
  financebros: "finance_culture",
  financebro: "finance_culture",
  fit: "athletic",
  gym: "athletic",
  hiking: "hiker",
  indieish: "indie",
  instrument: "musical",
  intellectualism: "intellectual",
  literature: "literary",
  musician: "musical",
  philosophy: "intellectual",
  readerly: "reader",
  selfhelp: "self_help",
  self_help: "self_help",
  socialite: "social",
  techy: "tech",
  thoughtfulness: "thoughtful",
};

export type MatchRow = {
  age: number | null;
  bio_blurb: string | null;
  campus: string | null;
  id: string;
  major: string | null;
  name: string;
  vibe_tags: string[] | null;
};

export type StoredBrief = {
  avoiding: string[] | null;
  id: string;
  looking_for: string[] | null;
  must_haves: string[] | null;
  raw_input: string | null;
  vibe: string | null;
};

export type ProposalContext = {
  brief: StoredBrief;
  match: MatchRow;
  proposed_date_id: string;
};

export type PreferenceInput = {
  avoiding: string[];
  looking_for: string[];
  must_haves: string[];
  raw_input: string;
  vibe: string;
};

export type FeedbackInput = {
  add_avoiding: string[];
  add_looking_for: string[];
  date_id: string;
  parsed_signal: string[];
  reason: string;
};

export async function createPreferenceBrief(input: PreferenceInput) {
  const userId = await getOrCreateDemoUser();
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO preference_briefs (user_id, raw_input, looking_for, avoiding, must_haves, vibe)
    VALUES (
      ${userId},
      ${input.raw_input},
      ${normalizeTags(input.looking_for)},
      ${normalizeTags(input.avoiding)},
      ${normalizeTags(input.must_haves)},
      ${input.vibe}
    )
    RETURNING id
  `;

  return { brief_id: row.id };
}

export async function findBriefByDateId(dateId: string): Promise<ProposalContext | null> {
  const rows = await sql<
    (StoredBrief & Omit<MatchRow, "id"> & { match_id: string; proposed_date_id: string })[]
  >`
    SELECT
      pd.id AS proposed_date_id,
      pb.id,
      pb.raw_input,
      pb.looking_for,
      pb.avoiding,
      pb.must_haves,
      pb.vibe,
      mp.id AS match_id,
      mp.name,
      mp.age,
      mp.major,
      mp.vibe_tags,
      mp.bio_blurb,
      mp.campus
    FROM proposed_dates pd
    JOIN preference_briefs pb ON pb.id = pd.brief_id
    JOIN mock_pool mp ON mp.id = pd.match_id
    WHERE pd.id = ${dateId}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    brief: {
      avoiding: row.avoiding,
      id: row.id,
      looking_for: row.looking_for,
      must_haves: row.must_haves,
      raw_input: row.raw_input,
      vibe: row.vibe,
    },
    match: {
      age: row.age,
      bio_blurb: row.bio_blurb,
      campus: row.campus,
      id: row.match_id,
      major: row.major,
      name: row.name,
      vibe_tags: row.vibe_tags,
    },
    proposed_date_id: row.proposed_date_id,
  };
}

export async function getRejectedMatchIds(briefId: string) {
  const rows = await sql<{ match_id: string }[]>`
    SELECT DISTINCT pd.match_id
    FROM proposed_dates pd
    WHERE pd.brief_id = ${briefId}
      AND pd.status = 'rejected'
  `;

  return rows.map((row) => row.match_id);
}

export async function searchMatchPoolDeterministic(params: {
  excludedMatchIds?: string[];
  limit?: number;
  negativeTags: string[];
  positiveTags: string[];
  preferredVibe?: string | null;
}) {
  const limit = params.limit ?? 3;
  const excludedMatchIds = new Set(params.excludedMatchIds ?? []);
  const positiveTags = normalizeTags(params.positiveTags);
  const negativeTags = normalizeTags(params.negativeTags);
  const positiveSet = new Set(positiveTags);
  const negativeSet = new Set(negativeTags);

  const rows = await sql<MatchRow[]>`
    SELECT id, name, age, major, vibe_tags, bio_blurb, campus
    FROM mock_pool
    WHERE campus = ${DEMO_CAMPUS}
  `;

  return rows
    .filter((row) => !excludedMatchIds.has(row.id))
    .map((row) => {
      const tags = normalizeTags(row.vibe_tags ?? []);
      const tagSet = new Set(tags);
      const positiveHits = positiveTags.filter((tag) => tagSet.has(tag)).length;
      const negativeHits = negativeTags.filter((tag) => tagSet.has(tag)).length;
      const bio = `${row.major ?? ""} ${row.bio_blurb ?? ""}`.toLowerCase();
      const bioBoost = positiveTags.filter((tag) => bio.includes(tag.replaceAll("_", " "))).length;
      const vibeBoost =
        params.preferredVibe && bio.includes(params.preferredVibe.toLowerCase().slice(0, 20)) ? 1 : 0;
      const mustAvoidPenalty =
        Array.from(negativeSet).some((tag) => tagSet.has(tag) || bio.includes(tag.replaceAll("_", " ")))
          ? 4
          : 0;

      return {
        candidate: row,
        score: positiveHits * 4 + bioBoost * 2 + vibeBoost - negativeHits * 4 - mustAvoidPenalty,
        tag_overlap: Array.from(positiveSet).filter((tag) => tagSet.has(tag)),
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function createProposedDate(params: {
  briefId: string;
  match: MatchRow;
  preferredTags: string[];
}) {
  const scheduledAt = nextTuesdayAtSevenPacific();
  const venue = chooseVenue(params.match, params.preferredTags);
  const sharedHook = buildSharedHook(params.match, params.preferredTags);

  const [row] = await sql<{
    created_at: string;
    id: string;
    scheduled_at: string;
    shared_hook: string;
    status: string;
    venue: string;
  }[]>`
    INSERT INTO proposed_dates (brief_id, match_id, venue, scheduled_at, shared_hook)
    VALUES (${params.briefId}, ${params.match.id}, ${venue}, ${scheduledAt}, ${sharedHook})
    RETURNING id, venue, scheduled_at, shared_hook, status, created_at
  `;

  return {
    date_id: row.id,
    match: params.match,
    plan: {
      created_at: row.created_at,
      scheduled_at: row.scheduled_at,
      shared_hook: row.shared_hook,
      status: row.status,
      venue: row.venue,
    },
  };
}

export async function recordRejectionFeedback(input: FeedbackInput) {
  await sql`
    UPDATE proposed_dates
    SET status = 'rejected'
    WHERE id = ${input.date_id}
  `;

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO rejection_feedback (date_id, reason, parsed_signal)
    VALUES (${input.date_id}, ${input.reason}, ${normalizeTags(input.parsed_signal)})
    RETURNING id
  `;

  return { feedback_id: row.id };
}

function chooseVenue(match: MatchRow, tags: string[]) {
  const normalized = new Set(normalizeTags(tags));

  if (normalized.has("coffee") || normalized.has("reader") || normalized.has("literary")) {
    return "Blue Bottle on College Ave";
  }
  if (normalized.has("outdoorsy") || normalized.has("hiker")) {
    return "Berkeley Marina for a sunset walk";
  }
  if (normalized.has("musical") || normalized.has("indie")) {
    return "Victory Point Cafe, then a walk down College Ave";
  }
  if ((match.vibe_tags ?? []).includes("film")) {
    return "Babette for coffee before a campus film night";
  }

  return "Philz Coffee on College Ave";
}

function buildSharedHook(match: MatchRow, tags: string[]) {
  const normalized = new Set(normalizeTags(tags));

  if (normalized.has("musical") && (match.vibe_tags ?? []).includes("musical")) {
    return `${match.name} is musical too, so this one has an easy built-in conversation starter.`;
  }
  if (normalized.has("literary") || normalized.has("reader")) {
    return `${match.name} feels like a real-books person, not a self-help cliché.`;
  }
  if (normalized.has("intellectual")) {
    return `${match.name} looks like the kind of person who can actually carry a thoughtful conversation.`;
  }

  return `${match.name} fits the vibe you described without drifting into the stuff you wanted to avoid.`;
}

function nextTuesdayAtSevenPacific() {
  const now = new Date();
  const pacificNow = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }),
  );
  const day = pacificNow.getDay();
  let delta = (2 - day + 7) % 7;
  if (delta === 0) delta = 7;
  pacificNow.setDate(pacificNow.getDate() + delta);
  pacificNow.setHours(19, 0, 0, 0);

  const yyyy = pacificNow.getFullYear();
  const mm = `${pacificNow.getMonth() + 1}`.padStart(2, "0");
  const dd = `${pacificNow.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T19:00:00-07:00`;
}

function normalizeTags(tags: string[]) {
  return Array.from(
    new Set(
      tags
        .map((tag) => tag.trim().toLowerCase().replaceAll(" ", "_"))
        .filter(Boolean)
        .map((tag) => TAG_ALIASES[tag] ?? tag),
    ),
  );
}

async function getOrCreateDemoUser() {
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
