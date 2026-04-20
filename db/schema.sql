CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  campus TEXT
);

CREATE TABLE IF NOT EXISTS mock_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  age INT,
  major TEXT,
  vibe_tags TEXT[],
  bio_blurb TEXT,
  campus TEXT
);

CREATE TABLE IF NOT EXISTS preference_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  raw_input TEXT,
  looking_for TEXT[],
  avoiding TEXT[],
  must_haves TEXT[],
  vibe TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS proposed_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brief_id UUID REFERENCES preference_briefs(id),
  match_id UUID REFERENCES mock_pool(id),
  venue TEXT,
  scheduled_at TIMESTAMPTZ,
  shared_hook TEXT,
  status TEXT DEFAULT 'proposed',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rejection_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date_id UUID REFERENCES proposed_dates(id),
  reason TEXT,
  parsed_signal TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);
