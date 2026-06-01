-- Initial schema for bengaluru.rent.
-- Note: the product spec requests CREATE INDEX CONCURRENTLY for spatial indexes.
-- Initial Supabase migrations commonly run transactionally, so this migration uses
-- normal index creation. These tables are empty at creation time, so there is no
-- production write traffic to block.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE pins (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom              geometry(Point, 4326) NOT NULL,
  lat               float8 NOT NULL,
  lng               float8 NOT NULL,
  bhk               int2 NOT NULL CHECK (bhk BETWEEN 1 AND 6),
  rent              int4 NOT NULL CHECK (rent > 0 AND rent < 1000000),
  furnished         bool NOT NULL DEFAULT false,
  gated             bool NOT NULL DEFAULT false,
  society_name      text,
  occupant_type     text NOT NULL DEFAULT 'any' CHECK (occupant_type IN ('family', 'bachelor', 'any')),
  deposit_months    int2 CHECK (deposit_months BETWEEN 0 AND 24),
  comment           text,
  comment_approved  bool DEFAULT NULL,
  session_id        uuid NOT NULL,
  ip_hash           text NOT NULL,
  report_count      int2 NOT NULL DEFAULT 0,
  is_hidden         bool NOT NULL DEFAULT false,
  is_suspicious     bool NOT NULL DEFAULT false,
  neighbourhood     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pins_geom ON pins USING GIST(geom);
CREATE INDEX idx_pins_session ON pins(session_id);
CREATE INDEX idx_pins_created ON pins(created_at DESC);

CREATE TABLE listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  listing_type      text NOT NULL CHECK (listing_type IN ('whole_flat', 'room')),
  rent_per_room     int4,
  available_from    text NOT NULL DEFAULT 'asap' CHECK (available_from IN ('asap', 'next_month', 'flex')),
  owner_email       text NOT NULL,
  owner_phone       text,
  gender_pref       text NOT NULL DEFAULT 'any' CHECK (gender_pref IN ('male', 'female', 'any')),
  smoking_ok        bool,
  food_pref         text NOT NULL DEFAULT 'any' CHECK (food_pref IN ('veg', 'nonveg', 'any')),
  parking_spots     int2 NOT NULL DEFAULT 0,
  is_active         bool NOT NULL DEFAULT true,
  session_id        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_pin ON listings(pin_id);
CREATE INDEX idx_listings_active ON listings(is_active) WHERE is_active = true;

CREATE TABLE seekers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom              geometry(Point, 4326) NOT NULL,
  looking_for       text NOT NULL CHECK (looking_for IN ('whole_flat', 'room', 'any')),
  budget_min        int4 NOT NULL DEFAULT 0,
  budget_max        int4 NOT NULL CHECK (budget_max > 0),
  bhk_pref          int2,
  radius_km         float4 NOT NULL DEFAULT 2.5,
  email             text NOT NULL,
  phone             text,
  gender            text CHECK (gender IN ('male', 'female', 'other')),
  lifestyle_note    text,
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '30 days',
  is_active         bool NOT NULL DEFAULT true,
  session_id        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_seekers_geom ON seekers USING GIST(geom);
CREATE INDEX idx_seekers_active ON seekers(is_active, expires_at) WHERE is_active = true;

CREATE TABLE matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id         uuid NOT NULL REFERENCES seekers(id),
  listing_id        uuid NOT NULL REFERENCES listings(id),
  match_score       float4,
  matched_at        timestamptz NOT NULL DEFAULT now(),
  email_sent_at     timestamptz,
  UNIQUE (seeker_id, listing_id)
);

CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  reporter_ip_hash  text NOT NULL,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, reporter_ip_hash)
);

CREATE TABLE ratings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  rater_session_id  uuid NOT NULL,
  locality_score    int2 CHECK (locality_score BETWEEN 1 AND 5),
  build_quality     int2 CHECK (build_quality BETWEEN 1 AND 5),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, rater_session_id)
);

CREATE TABLE watchlist (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom              geometry(Point, 4326) NOT NULL,
  email             text NOT NULL,
  phone             text,
  radius_km         float4 NOT NULL DEFAULT 2.5,
  bhk_pref          int2,
  max_rent          int4,
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_watchlist_geom ON watchlist USING GIST(geom);

CREATE TABLE newsletter (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text UNIQUE NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ip_bans (
  ip_hash           text PRIMARY KEY,
  reason            text,
  banned_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type        text NOT NULL CHECK (agent_type IN ('matching', 'moderation', 'email_loop')),
  model             text NOT NULL,
  input_tokens      int4,
  output_tokens     int4,
  cost_usd          float4,
  duration_ms       int4,
  action_summary    jsonb,
  error             text,
  ran_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seekers ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pins_public_read" ON pins
  FOR SELECT USING (is_hidden = false);

CREATE POLICY "pins_own_read" ON pins
  FOR SELECT USING (session_id = auth.uid());

CREATE POLICY "listings_public_read" ON listings
  FOR SELECT USING (is_active = true);

CREATE POLICY "seekers_own_read" ON seekers
  FOR SELECT USING (session_id = auth.uid());

CREATE POLICY "ratings_public_read" ON ratings
  FOR SELECT USING (true);

CREATE POLICY "ratings_own_write" ON ratings
  FOR INSERT WITH CHECK (rater_session_id = auth.uid());

CREATE OR REPLACE FUNCTION update_pin_hidden()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pins SET is_hidden = true
  WHERE id = NEW.id AND report_count >= 3;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_report_count
AFTER UPDATE OF report_count ON pins
FOR EACH ROW EXECUTE FUNCTION update_pin_hidden();
