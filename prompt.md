# One-Shot Agent Prompt: Rebuild bengaluru.rent from Scratch

> **How to use this prompt:** Feed this entire document as your system/user prompt to a coding agent (Claude Code, Cursor Agent, etc.). It contains the full product spec, tech decisions, data model, and a 8-stage incremental build plan. Work through stages sequentially. Do not skip stages — each one is a working, deployable checkpoint.

---

## 0. What You Are Building

**bengaluru.rent** is an anonymous rent transparency map for Bengaluru, India. Real renters drop pins on a Google Map showing what they actually pay — no login, no broker, no bullshit. It grew to ₹200 Cr+ worth of rent tracked, 4,000+ users, and 591 flat-flatmate matches in its first weeks, built by a single developer over a weekend using vibe-coding.

You are rebuilding it as a production-grade application that:
- Preserves the core magic: **anonymous, no-login, map-first, tap-and-see**
- Replaces fragile IP-based identity with proper anonymous sessions
- Adds a real API layer with server-side validation
- Implements testable, observable AI agents
- Is deployable with proper monitoring and cost controls

The soul of the product must remain: **anyone in Bengaluru can know what their neighbour actually pays for rent in 30 seconds, with zero friction.**

---

## 1. Tech Stack — Final Decisions

Do not deviate from these choices without a documented reason.

| Layer | Technology | Why |
|---|---|---|
| Framework | Next.js 15 (App Router) | SSR for SEO (neighbourhood pages), client components for map |
| Language | TypeScript (strict mode) | Type safety, prevents the class of bugs vibe-coding produces |
| Styling | Tailwind CSS v4 + shadcn/ui | Speed + accessible components (modals, drawers, filters) |
| Maps | `@vis.gl/react-google-maps` + Supercluster | Official React Google Maps wrapper; Supercluster for client-side pin clustering |
| State (UI) | Zustand | Map state: active modal, pin placement mode, layer toggles, filters |
| State (server) | TanStack Query v5 | Caching, background refetch, optimistic updates for pins |
| Database | Supabase (PostgreSQL 16 + PostGIS + pgcrypto) | Managed, keeps spatial ops, anonymous auth built-in |
| Auth | Supabase Anonymous Auth | Persistent UUID per device, zero UX friction, upgradeable to email |
| API Layer | Next.js Route Handlers (Node.js runtime) | All writes go through server — service role key never hits the browser |
| Job Queue | `pg-boss` (PostgreSQL-backed) | Async comment moderation; decoupled from HTTP latency |
| AI — Matching | Anthropic SDK, `claude-sonnet-4-5` | Nightly matching engine with tool use |
| AI — Moderation | Anthropic SDK, `claude-haiku-4-5` | Inline comment classification, fast + cheap |
| AI — Email | Anthropic SDK, `claude-sonnet-4-5` | Email intent parser + Supabase writer |
| Email | Resend | Transactional match emails, watchlist alerts |
| Scheduling | Vercel Cron (or `pg-boss` scheduler) | Nightly matching agent trigger |
| Satellite tiles | Pre-rendered PNGs, hosted on Supabase Storage or Vercel public | Sentinel-2 NDVI tiles, served as a map overlay |
| Monitoring | Sentry (errors) + a custom `/admin` cost dashboard | Agent token costs can spiral; must be visible |
| Deployment | Vercel (frontend + route handlers) | Edge network, India CDN PoPs |

---

## 2. Repository Structure

```
bengaluru-rent/
├── app/
│   ├── page.tsx                     # Main map page (SSR shell, client map)
│   ├── [neighbourhood]/page.tsx     # SEO pages: /koramangala, /indiranagar etc.
│   ├── api/
│   │   ├── pins/route.ts            # GET (public) + POST (server-validated)
│   │   ├── pins/[id]/route.ts       # PATCH + DELETE (session-verified)
│   │   ├── pins/[id]/report/route.ts
│   │   ├── listings/route.ts        # Flat/room listings (owners)
│   │   ├── seekers/route.ts         # Seeker registrations
│   │   ├── comments/route.ts        # Comment submission → pg-boss queue
│   │   ├── watchlist/route.ts
│   │   ├── newsletter/route.ts
│   │   └── agents/
│   │       ├── match/route.ts       # POST (called by Vercel Cron)
│   │       └── email-loop/route.ts  # POST (called by Vercel Cron or webhook)
│   └── admin/
│       └── page.tsx                 # Agent runs dashboard (protected)
├── components/
│   ├── map/
│   │   ├── RentMap.tsx              # Main map component (client)
│   │   ├── PinMarker.tsx
│   │   ├── PinCluster.tsx
│   │   ├── PinInfoPopup.tsx
│   │   ├── AreaStatsOverlay.tsx
│   │   ├── MetroOverlay.tsx
│   │   └── SentinelOverlay.tsx
│   ├── forms/
│   │   ├── DropPinForm.tsx
│   │   ├── AddListingForm.tsx
│   │   ├── RegisterSeekerForm.tsx
│   │   └── WatchlistForm.tsx
│   └── ui/                          # shadcn/ui components
├── lib/
│   ├── supabase/
│   │   ├── client.ts                # Browser client (anon key)
│   │   ├── server.ts                # Server client (service role)
│   │   └── types.ts                 # Generated DB types
│   ├── agents/
│   │   ├── matching-agent.ts
│   │   ├── moderation-agent.ts
│   │   └── email-intent-agent.ts
│   ├── queue/
│   │   └── pg-boss.ts
│   └── utils/
│       ├── geo.ts                   # Coordinate rounding, distance utils
│       └── validation.ts            # Junk email/phone detection
├── store/
│   └── map-store.ts                 # Zustand store
├── hooks/
│   ├── usePins.ts                   # TanStack Query for pins
│   └── useAreaStats.ts
├── supabase/
│   ├── migrations/                  # All DB migrations
│   └── seed.sql
└── vercel.json                      # Cron config
```

---

## 3. Database Schema — Full Specification

Run these migrations in order in Supabase. Do not create tables manually through the dashboard.

### 3.1 Extensions
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 3.2 Core Tables

```sql
-- PINS: Anonymously submitted rent data points
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
  comment_approved  bool DEFAULT NULL,        -- NULL = pending, true = approved, false = rejected
  session_id        uuid NOT NULL,            -- Supabase anonymous auth session ID
  ip_hash           text NOT NULL,            -- SHA-256 of IP, server-side only
  report_count      int2 NOT NULL DEFAULT 0,
  is_hidden         bool NOT NULL DEFAULT false,   -- auto-hide at report_count >= 3
  is_suspicious     bool NOT NULL DEFAULT false,   -- excluded from stats/averages
  neighbourhood     text,                     -- reverse-geocoded on insert
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Geospatial index — CRITICAL for ST_DWithin performance
CREATE INDEX CONCURRENTLY idx_pins_geom ON pins USING GIST(geom);
CREATE INDEX idx_pins_session ON pins(session_id);
CREATE INDEX idx_pins_created ON pins(created_at DESC);

-- LISTINGS: Flats/rooms actively available for rent
CREATE TABLE listings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  listing_type      text NOT NULL CHECK (listing_type IN ('whole_flat', 'room')),
  rent_per_room     int4,                     -- populated only for type = 'room'
  available_from    text NOT NULL DEFAULT 'asap' CHECK (available_from IN ('asap', 'next_month', 'flex')),
  owner_email       text NOT NULL,            -- stored encrypted via pgcrypto
  owner_phone       text,                     -- stored encrypted via pgcrypto
  gender_pref       text NOT NULL DEFAULT 'any' CHECK (gender_pref IN ('male', 'female', 'any')),
  smoking_ok        bool,                     -- NULL = no preference
  food_pref         text NOT NULL DEFAULT 'any' CHECK (food_pref IN ('veg', 'nonveg', 'any')),
  parking_spots     int2 NOT NULL DEFAULT 0,
  is_active         bool NOT NULL DEFAULT true,
  session_id        uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_listings_pin ON listings(pin_id);
CREATE INDEX idx_listings_active ON listings(is_active) WHERE is_active = true;

-- SEEKERS: People looking for flats/rooms, registered for matching
CREATE TABLE seekers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geom              geometry(Point, 4326) NOT NULL,  -- target location centre
  looking_for       text NOT NULL CHECK (looking_for IN ('whole_flat', 'room', 'any')),
  budget_min        int4 NOT NULL DEFAULT 0,
  budget_max        int4 NOT NULL CHECK (budget_max > 0),
  bhk_pref          int2,                     -- NULL = any
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

CREATE INDEX CONCURRENTLY idx_seekers_geom ON seekers USING GIST(geom);
CREATE INDEX idx_seekers_active ON seekers(is_active, expires_at) WHERE is_active = true;

-- MATCHES: Log of all matches made by the AI agent
CREATE TABLE matches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seeker_id         uuid NOT NULL REFERENCES seekers(id),
  listing_id        uuid NOT NULL REFERENCES listings(id),
  match_score       float4,                   -- 0.0–1.0 confidence
  matched_at        timestamptz NOT NULL DEFAULT now(),
  email_sent_at     timestamptz,
  UNIQUE (seeker_id, listing_id)
);

-- REPORTS: User-submitted pin reports
CREATE TABLE reports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  reporter_ip_hash  text NOT NULL,
  reason            text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, reporter_ip_hash)            -- one report per IP per pin
);

-- RATINGS: Locality + building quality scores per pin
CREATE TABLE ratings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id            uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  rater_session_id  uuid NOT NULL,
  locality_score    int2 CHECK (locality_score BETWEEN 1 AND 5),
  build_quality     int2 CHECK (build_quality BETWEEN 1 AND 5),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pin_id, rater_session_id)
);

-- WATCHLIST: Email/phone alerts when new listings appear in an area
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

CREATE INDEX CONCURRENTLY idx_watchlist_geom ON watchlist USING GIST(geom);

-- NEWSLETTER: Simple email list
CREATE TABLE newsletter (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text UNIQUE NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- IP_BANS: Server-side block list
CREATE TABLE ip_bans (
  ip_hash           text PRIMARY KEY,
  reason            text,
  banned_at         timestamptz NOT NULL DEFAULT now()
);

-- AGENT_RUNS: Observability log for all Claude agent executions
CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type        text NOT NULL CHECK (agent_type IN ('matching', 'moderation', 'email_loop')),
  model             text NOT NULL,
  input_tokens      int4,
  output_tokens     int4,
  cost_usd          float4,
  duration_ms       int4,
  action_summary    jsonb,                    -- e.g. { matches_made: 12, emails_sent: 12 }
  error             text,
  ran_at            timestamptz NOT NULL DEFAULT now()
);
```

### 3.3 Row Level Security Policies

```sql
-- Enable RLS on all tables
ALTER TABLE pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE seekers ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- PINS: Public read (excluding hidden), writes only through API
CREATE POLICY "pins_public_read" ON pins
  FOR SELECT USING (is_hidden = false);

-- Only session owner can see their own hidden pins
CREATE POLICY "pins_own_read" ON pins
  FOR SELECT USING (session_id = auth.uid());

-- No direct INSERT from browser — all writes go through Route Handler with service role
-- SERVICE ROLE bypasses RLS entirely for API writes

-- LISTINGS: Public read for active listings (email/phone hidden via view)
CREATE POLICY "listings_public_read" ON listings
  FOR SELECT USING (is_active = true);

-- SEEKERS: Private — session owner only
CREATE POLICY "seekers_own_read" ON seekers
  FOR SELECT USING (session_id = auth.uid());

-- RATINGS: Public read, own write
CREATE POLICY "ratings_public_read" ON ratings FOR SELECT USING (true);
CREATE POLICY "ratings_own_write" ON ratings FOR INSERT WITH CHECK (rater_session_id = auth.uid());
```

### 3.4 Database Trigger: Auto-hide pins on 3+ reports

```sql
CREATE OR REPLACE FUNCTION update_pin_hidden()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE pins SET is_hidden = true
  WHERE id = NEW.pin_id AND report_count >= 3;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_report_count
AFTER UPDATE OF report_count ON pins
FOR EACH ROW EXECUTE FUNCTION update_pin_hidden();
```

---

## 4. Environment Variables

```bash
# .env.local (Vercel env vars in production)
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...          # Safe for browser: only public reads
SUPABASE_SERVICE_ROLE_KEY=...              # Server only — NEVER in client code
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...        # Restrict to HTTP referrers in GCP Console
ANTHROPIC_API_KEY=...                      # Server only
RESEND_API_KEY=...                         # Server only
CRON_SECRET=...                            # Shared secret for Vercel Cron → API auth
GMAIL_CLIENT_ID=...                        # OAuth2 for email reply agent
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
```

---

## 5. Incremental Development Plan

Build and verify each stage before proceeding. Each stage ends in a deployable, testable checkpoint.

---

### STAGE 1 — Foundation: Project Skeleton + Live Map with Pins

**Goal:** A working Next.js app deployed on Vercel. Map loads. Existing pins from Supabase render as clustered markers. Clicking a pin shows basic info.

#### Tasks:

1. **Scaffold the project**
   ```bash
   npx create-next-app@latest bengaluru-rent \
     --typescript --tailwind --app --src-dir=false \
     --import-alias="@/*"
   ```
   Install dependencies:
   ```bash
   npm i @supabase/supabase-js @supabase/ssr zustand @tanstack/react-query \
     @vis.gl/react-google-maps supercluster @types/supercluster \
     @anthropic-ai/sdk resend pg-boss
   npx shadcn@latest init
   npx shadcn@latest add dialog drawer button input select badge sheet
   ```

2. **Supabase setup**
   - Create a Supabase project (ap-south-1 region)
   - Run all migrations from §3
   - Generate TypeScript types: `npx supabase gen types typescript --project-id [id] > lib/supabase/types.ts`
   - Create `lib/supabase/client.ts` (browser, anon key) and `lib/supabase/server.ts` (server, service role)

3. **Supabase Anonymous Auth**
   Enable anonymous sign-ins in Supabase dashboard → Auth → Providers.
   In the app root layout, call `supabase.auth.signInAnonymously()` if no session exists. Store the session in a cookie via `@supabase/ssr`. This gives every visitor a persistent UUID (`auth.uid()`) on first load — no prompt, no friction.

4. **Google Maps integration**
   - Restrict the API key in Google Cloud Console: HTTP referrers → `bengaluru.rent/*` + `localhost:3000/*`. Enable: Maps JS API, Places API only.
   - Create `components/map/RentMap.tsx` as a `"use client"` component.
   - Use `<APIProvider apiKey={...}>` and `<Map>` from `@vis.gl/react-google-maps`.
   - Default centre: `[12.9716, 77.5946]` (Bengaluru), zoom: 12.

5. **Fetch & display pins**
   - `GET /api/pins` — Route Handler that queries Supabase with the server client. Returns pins with coordinates rounded to 4 decimal places (~11m precision) — **never return exact coordinates**. Include: `id, lat, lng, bhk, rent, furnished, gated, society_name, occupant_type, neighbourhood, created_at, report_count`.
   - In `RentMap.tsx`, use TanStack Query (`usePins` hook) to fetch pins.
   - Implement Supercluster clustering: group nearby pins at low zoom, show individual markers at high zoom.
   - Pin colour coding: by BHK (1BHK = blue, 2BHK = green, 3BHK = amber, 3+BHK = coral).

6. **Pin info popup**
   On marker click, show a `<PinInfoPopup>` (floating card or map InfoWindow) with:
   - Rent amount (bold, large), BHK, Furnished/Unfurnished, Gated/Open, society name
   - Neighbourhood, days since posted
   - Action buttons: Report | Rate this area | (if session owner: Edit / Delete)
   - If a listing exists for this pin, show a "🏠 Flat available" badge + "I'm looking" CTA

7. **Area search**
   Add a search box (Google Places Autocomplete restricted to `(cities)` + Bengaluru bias) that pans the map to the searched location.

**Stage 1 checkpoint:** Deploy to Vercel. Map loads, clusters render, clicking a marker shows the info popup. Area search pans the map.

---

### STAGE 2 — Pin Submission: Full Drop-a-Pin Flow

**Goal:** Any visitor can drop a pin in ≤60 seconds. Server validates and stores it. Rate limiting prevents spam.

#### Tasks:

1. **Drop Pin UX**
   - Floating `+ Drop a Pin` button (bottom-right of map).
   - Click button → map cursor changes to crosshair mode (Zustand `isPinPlacementMode = true`).
   - User clicks on map → coordinates captured → slide-up `<DropPinForm>` drawer (shadcn `<Drawer>`) opens with the selected coordinates shown as a small map thumbnail.
   - Alternatively: long-press on mobile.

2. **DropPinForm fields**
   ```
   Rent (₹/month)        — required, number, min 1000
   BHK                   — required, select: 1 / 2 / 3 / 3+ / 4+ / 5+
   Furnished             — toggle: Furnished / Semi / Unfurnished
   Gated society         — toggle: Yes / No
   Occupant type         — select: Family / Bachelor / Any
   Society/building name — optional text
   Deposit               — optional, number (months)
   Comment               — optional, textarea, max 200 chars
   ```
   Show real-time rent context: "In this area, 2BHKs typically go for ₹X–₹Y" (computed from nearby existing pins).

3. **`POST /api/pins` Route Handler**
   This runs server-side. Steps:
   - Extract the visitor's real IP from `x-forwarded-for` header. Hash it with SHA-256. Check `ip_bans` table — if banned, return 403.
   - Rate limit: max 3 pins per IP-hash per 24h. Query `pins` table: `WHERE ip_hash = $1 AND created_at > now() - interval '24 hours'`. If count ≥ 3, return 429.
   - Validate all fields (types, ranges). Strip any HTML.
   - Junk email/phone detection (if provided): reject obvious patterns (`test@test.com`, `1234567890`).
   - Reverse-geocode coordinates using Google Maps Geocoding API to populate `neighbourhood`.
   - Insert into `pins` using service role client (bypasses RLS).
   - Enqueue comment moderation in pg-boss if `comment` is non-null.
   - Return the created pin (with rounded coordinates).

4. **Edit & Delete**
   - `PATCH /api/pins/[id]` — verify `session_id` from cookie matches `pins.session_id`. Allow editing: rent, furnished, occupant_type, comment.
   - `DELETE /api/pins/[id]` — same session check. Soft delete: set `is_hidden = true`.
   - In `<PinInfoPopup>`, show Edit/Delete only when `session.user.id === pin.session_id`.

5. **Report a pin**
   - `POST /api/pins/[id]/report` — server extracts IP hash, checks for duplicate report, increments `report_count`, triggers auto-hide if ≥ 3.

6. **Area Stats overlay**
   When map viewport changes, compute and display area-level rent stats:
   - `GET /api/pins?bounds=[sw_lat,sw_lng,ne_lat,ne_lng]` — filter by viewport bounding box.
   - Client-side: group pins by `neighbourhood`. Compute median rent per BHK per neighbourhood.
   - Render as a translucent `<AreaStatsOverlay>` panel (bottom-left) showing top-3 neighbourhoods in viewport with median rents.

**Stage 2 checkpoint:** A visitor can drop a pin, submit the form, see it appear on the map immediately (optimistic update), and see area stats update as they pan.

---

### STAGE 3 — Listing & Seeking: Flat/Flatmate Matching Flow

**Goal:** Owners can mark their pin as an active listing. Seekers can register. The Claude nightly agent matches them and sends emails via Resend.

#### Tasks:

1. **"I have a flat" flow — Add Listing**
   - In `<PinInfoPopup>`, if `session_id` matches and no listing exists for this pin: show `"📋 Mark as available"` button.
   - Opens `<AddListingForm>` with fields:
     ```
     Type                — Whole flat / Single room
     Rent per room       — number (if room type)
     Available from      — ASAP / Next month / Flexible
     Gender preference   — Male / Female / Any
     Smoking OK          — Yes / No / No preference
     Food preference     — Veg / Non-veg / Any
     Parking spots       — 0 / 1 / 2+
     Your email          — required (for match notification)
     Your phone          — optional
     ```
   - `POST /api/listings` — server validates, encrypts `owner_email` and `owner_phone` using `pgp_sym_encrypt(value, $ENCRYPTION_KEY)` before insert. Returns listing ID (no email/phone in response).

2. **"I'm looking" flow — Register as Seeker**
   - From the main map: `"🔍 Find a flat"` button → `<RegisterSeekerForm>` drawer.
   - User clicks their target location on the map (or uses Places search).
   - Fields:
     ```
     Looking for         — Whole flat / Room / Either
     Budget              — slider or range input: min–max ₹/month
     BHK preference      — Any / 1 / 2 / 3 / 3+
     Search radius       — 1km / 2.5km / 5km
     Your email          — required
     Your phone          — optional
     Gender              — Male / Female / Other (for compatibility matching)
     Lifestyle note      — optional free text (max 100 chars)
     ```
   - `POST /api/seekers` — validates, encrypts contact info, sets `expires_at = now() + 30 days`.
   - Confirm screen: "You're on the list! Claude checks for matches every night and will email you when something fits."

3. **Nightly Matching Agent — `lib/agents/matching-agent.ts`**

   This is the core AI agent. Implement it as a standalone async function called by the Route Handler.

   ```typescript
   // lib/agents/matching-agent.ts
   import Anthropic from "@anthropic-ai/sdk";
   import { createClient } from "@/lib/supabase/server";
   import { Resend } from "resend";

   export async function runMatchingAgent(): Promise<AgentRunResult> {
     const startTime = Date.now();
     const supabase = createClient(); // service role
     const anthropic = new Anthropic();
     const resend = new Resend(process.env.RESEND_API_KEY);

     // 1. Fetch all active seekers (not expired)
     const { data: seekers } = await supabase
       .from("seekers")
       .select("*")
       .eq("is_active", true)
       .gt("expires_at", new Date().toISOString());

     // 2. Fetch all active listings with their pin data
     const { data: listings } = await supabase
       .from("listings")
       .select("*, pins(*)")
       .eq("is_active", true);

     // 3. For each seeker, find candidate listings within their radius using PostGIS
     // Do spatial pre-filtering in SQL — never send the full dataset to Claude
     const matchPairs: MatchPair[] = [];

     for (const seeker of seekers) {
       const { data: candidates } = await supabase.rpc("find_candidates", {
         seeker_lat: seeker.geom.coordinates[1],
         seeker_lng: seeker.geom.coordinates[0],
         radius_km: seeker.radius_km,
         budget_max: seeker.budget_max,
       });

       if (!candidates || candidates.length === 0) continue;

       // 4. Send seeker + candidates to Claude for compatibility scoring
       const response = await anthropic.messages.create({
         model: "claude-sonnet-4-5",
         max_tokens: 1000,
         system: `You are a rent matching engine for bengaluru.rent. 
           Given a seeker's preferences and a list of candidate listings, 
           return a JSON array of matches sorted by compatibility score (0.0–1.0).
           Only include listings with score >= 0.6.
           Return ONLY valid JSON, no prose.
           Format: [{"listing_id": "...", "score": 0.85, "reason": "..."}]`,
         messages: [
           {
             role: "user",
             content: JSON.stringify({ seeker, candidates }),
           },
         ],
       });

       const text = response.content[0].type === "text" ? response.content[0].text : "[]";
       const scored = JSON.parse(text.replace(/```json|```/g, "").trim());

       for (const match of scored) {
         // Check not already matched
         const { data: existing } = await supabase
           .from("matches")
           .select("id")
           .eq("seeker_id", seeker.id)
           .eq("listing_id", match.listing_id)
           .single();

         if (!existing) {
           matchPairs.push({ seeker, listing: candidates.find(c => c.id === match.listing_id), score: match.score });
         }
       }
     }

     // 5. Send match emails and log to matches table
     let emailsSent = 0;
     for (const pair of matchPairs) {
       const ownerEmail = decrypt(pair.listing.owner_email); // pgp_sym_decrypt
       const seekerEmail = decrypt(pair.seeker.email);

       // Email to seeker
       await resend.emails.send({
         from: "matches@bengaluru.rent",
         to: seekerEmail,
         subject: `🏠 Match found: ${pair.listing.pins.bhk}BHK in ${pair.listing.pins.neighbourhood}`,
         html: buildSeekerMatchEmail(pair),
       });

       // Email to owner
       await resend.emails.send({
         from: "matches@bengaluru.rent",
         to: ownerEmail,
         subject: `🔍 Someone's looking for your flat`,
         html: buildOwnerMatchEmail(pair),
       });

       // Log match
       await supabase.from("matches").insert({
         seeker_id: pair.seeker.id,
         listing_id: pair.listing.id,
         match_score: pair.score,
         email_sent_at: new Date().toISOString(),
       });

       emailsSent++;
     }

     // 6. Log the agent run
     const runRecord = {
       agent_type: "matching",
       model: "claude-sonnet-4-5",
       duration_ms: Date.now() - startTime,
       action_summary: { matches_made: matchPairs.length, emails_sent: emailsSent },
     };
     await supabase.from("agent_runs").insert(runRecord);

     return runRecord;
   }
   ```

   Create the PostGIS RPC function:
   ```sql
   CREATE OR REPLACE FUNCTION find_candidates(
     seeker_lat float8, seeker_lng float8, radius_km float4, budget_max int4
   )
   RETURNS TABLE (
     id uuid, pin_id uuid, listing_type text, rent_per_room int4,
     available_from text, gender_pref text, smoking_ok bool, food_pref text,
     parking_spots int2, neighbourhood text, bhk int2, rent int4,
     furnished bool, lat float8, lng float8
   ) AS $$
     SELECT l.id, l.pin_id, l.listing_type, l.rent_per_room, l.available_from,
            l.gender_pref, l.smoking_ok, l.food_pref, l.parking_spots,
            p.neighbourhood, p.bhk, p.rent, p.furnished, p.lat, p.lng
     FROM listings l
     JOIN pins p ON l.pin_id = p.id
     WHERE l.is_active = true
       AND p.is_hidden = false
       AND p.rent <= budget_max
       AND ST_DWithin(
         p.geom,
         ST_SetSRID(ST_MakePoint(seeker_lng, seeker_lat), 4326)::geography,
         radius_km * 1000
       )
   $$ LANGUAGE sql SECURITY DEFINER;
   ```

4. **Cron trigger — `app/api/agents/match/route.ts`**
   ```typescript
   export async function POST(req: Request) {
     // Verify Vercel Cron secret
     if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
       return new Response("Unauthorized", { status: 401 });
     }
     const result = await runMatchingAgent();
     return Response.json(result);
   }
   ```
   
   `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/agents/match", "schedule": "0 22 * * *" }
     ]
   }
   ```
   This triggers at 10 PM IST (22:00 UTC+5:30 → 16:30 UTC, adjust as needed) nightly.

5. **Match email templates**
   Build simple, clean HTML emails (inline CSS only, tested on Gmail/Outlook). Include:
   - Seeker email: listing details, owner's phone/email, map link, "Reply to this email to update your search status" footer
   - Owner email: seeker's preferences, their phone/email, "Reply to this email if you've rented the flat" footer

**Stage 3 checkpoint:** An owner can mark their pin as available. A seeker can register. After triggering `POST /api/agents/match` manually, both parties receive match emails with each other's contact details.

---

### STAGE 4 — Comment Moderation: Claude Haiku Async Queue

**Goal:** Pin comments are moderated by Claude Haiku asynchronously. Comments appear as "pending" immediately, then either publish or get flagged within seconds.

#### Tasks:

1. **Set up pg-boss queue — `lib/queue/pg-boss.ts`**
   ```typescript
   import PgBoss from "pg-boss";

   let boss: PgBoss | null = null;

   export async function getQueue() {
     if (!boss) {
       boss = new PgBoss(process.env.DATABASE_URL!);
       await boss.start();

       // Register the moderation worker
       await boss.work("moderate-comment", async (jobs) => {
         for (const job of jobs) {
           await moderateComment(job.data as CommentJob);
         }
       });
     }
     return boss;
   }
   ```

2. **Comment moderation agent — `lib/agents/moderation-agent.ts`**
   ```typescript
   import Anthropic from "@anthropic-ai/sdk";

   interface CommentJob {
     pin_id: string;
     comment: string;
   }

   export async function moderateComment({ pin_id, comment }: CommentJob) {
     const anthropic = new Anthropic();
     const supabase = createClient();

     const response = await anthropic.messages.create({
       model: "claude-haiku-4-5",
       max_tokens: 100,
       system: `You are a content moderator for a public rent transparency board in India.
         Classify the comment as safe or unsafe.
         Safe: genuine rent info, neighbourhood feedback, helpful tips, mild frustration.
         Unsafe: abuse, hate speech, phone numbers/emails (privacy risk), spam, ads, sexual content.
         Respond ONLY with JSON: {"safe": true/false, "reason": "brief reason"}`,
       messages: [{ role: "user", content: comment }],
     });

     const text = response.content[0].type === "text" ? response.content[0].text : '{"safe":true}';
     const result = JSON.parse(text);

     // Update the pin's comment approval status
     await supabase
       .from("pins")
       .update({ comment_approved: result.safe })
       .eq("id", pin_id);

     // Log cost
     await supabase.from("agent_runs").insert({
       agent_type: "moderation",
       model: "claude-haiku-4-5",
       input_tokens: response.usage.input_tokens,
       output_tokens: response.usage.output_tokens,
       cost_usd: (response.usage.input_tokens * 0.00000025) + (response.usage.output_tokens * 0.00000125),
       action_summary: { pin_id, safe: result.safe, reason: result.reason },
     });
   }
   ```

3. **Comment submission in Route Handler**
   In `POST /api/pins`, after inserting a pin with a comment, add:
   ```typescript
   if (body.comment) {
     const queue = await getQueue();
     await queue.send("moderate-comment", { pin_id: createdPin.id, comment: body.comment });
   }
   ```

4. **Display logic in `<PinInfoPopup>`**
   - `comment_approved = null` → show comment with "pending review" badge
   - `comment_approved = true` → show comment normally
   - `comment_approved = false` → hide comment (don't show "rejected", just omit it)

**Stage 4 checkpoint:** Drop a pin with a comment. It appears with "pending" state. Within a few seconds, the pg-boss worker runs Haiku and the comment either appears or disappears.

---

### STAGE 5 — Map Layers: Metro Overlay + Sentinel-2 Green Cover

**Goal:** Users can toggle Namma Metro lines/stations and Bengaluru's green cover (NDVI) over the map.

#### Tasks:

1. **Metro Overlay — `components/map/MetroOverlay.tsx`**
   - Download Namma Metro GeoJSON from BMRCL open data or use a handcrafted GeoJSON with the Purple Line and Green Line routes + all stations.
   - Store as a static file at `public/data/namma-metro.geojson`.
   - Render using Google Maps `<Polyline>` components (for routes) and custom markers (for stations) inside the `<Map>` component.
   - Purple Line: colour `#7B2D8B`. Green Line: colour `#00A651`.
   - Station markers: small circle markers with station name tooltip on hover.
   - Toggle via Zustand `showMetroLayer` boolean, controlled by a layer toggle panel.

2. **Sentinel-2 Green Cover Overlay — `components/map/SentinelOverlay.tsx`**
   - Pre-process: Use the Sentinel-2 NDVI data (NIR Band 8, Red Band 4) to generate a PNG overlay tile for Bengaluru at a fixed resolution. Formula: `NDVI = (NIR - Red) / (NIR + Red)`. Colour-map: negative/zero = grey (urban), 0–0.3 = yellow-green, 0.3–0.6 = green, 0.6+ = dark green.
   - Store the resulting PNG (or GeoTIFF tiles) in Supabase Storage under `satellite-tiles/` bucket with public access.
   - Render using Google Maps `GroundOverlay` API: `new google.maps.GroundOverlay(tileUrl, bounds)` where bounds cover greater Bengaluru.
   - Add a legend card (bottom-left) showing the NDVI colour scale.
   - Toggle via Zustand `showGreenCover` boolean.
   - Data refresh note: add a last-updated badge ("Data: Mar 2026"). Update manually when fresh Sentinel-2 imagery is processed.

3. **Layer Toggle Panel**
   A small floating card (top-right or as a `<Sheet>` drawer on mobile) with toggles:
   - 🚇 Metro Lines
   - 🌿 Green Cover
   - (future) 🏫 Schools/Colleges
   Each toggle updates Zustand state; the corresponding overlay renders/hides.

**Stage 5 checkpoint:** User can toggle metro lines and see Bengaluru's green cover, giving spatial context around any pin.

---

### STAGE 6 — Email Reply Agent: Agentic Email Loop

**Goal:** Owners and seekers can reply to match emails in plain English. Claude reads the reply, extracts intent, and updates Supabase. No app needed — just email.

#### Tasks:

1. **Gmail OAuth2 Setup**
   - Create a Google Cloud service account. Enable Gmail API. Generate OAuth2 credentials.
   - Store `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` in env vars.
   - Set the match email reply-to address as a monitored inbox (e.g., `loop@bengaluru.rent`).

2. **Email reading utility — `lib/gmail.ts`**
   ```typescript
   import { google } from "googleapis";

   export async function getUnreadMatchReplies() {
     const auth = new google.auth.OAuth2(
       process.env.GMAIL_CLIENT_ID,
       process.env.GMAIL_CLIENT_SECRET
     );
     auth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
     
     const gmail = google.gmail({ version: "v1", auth });
     const { data } = await gmail.users.messages.list({
       userId: "me",
       q: "is:unread label:match-replies",
       maxResults: 50,
     });
     // Fetch full message content for each, return structured list
     return fetchMessageContents(gmail, data.messages || []);
   }
   ```

3. **Email intent agent — `lib/agents/email-intent-agent.ts`**
   ```typescript
   export async function runEmailIntentAgent() {
     const emails = await getUnreadMatchReplies();
     
     for (const email of emails) {
       const response = await anthropic.messages.create({
         model: "claude-sonnet-4-5",
         max_tokens: 300,
         system: `You are processing email replies from renters on bengaluru.rent.
           Extract intent from the reply and return JSON:
           {
             "intent": "still_available" | "rented" | "update_phone" | "deactivate_search" | "extend_search" | "unknown",
             "new_phone": "string or null",
             "notes": "brief explanation"
           }
           Be generous — simple replies like "still available", "yes", "found one" are enough to determine intent.`,
         messages: [{ role: "user", content: email.body }],
       });

       const text = response.content[0].type === "text" ? response.content[0].text : '{"intent":"unknown"}';
       const intent = JSON.parse(text);

       // Act on intent
       switch (intent.intent) {
         case "rented":
           await supabase.from("listings")
             .update({ is_active: false })
             .eq("owner_email_hash", email.sender_hash);
           break;
         case "still_available":
           // No-op, just mark email as read
           break;
         case "update_phone":
           await supabase.from("listings")
             .update({ owner_phone: encrypt(intent.new_phone) })
             .eq("owner_email_hash", email.sender_hash);
           break;
         case "deactivate_search":
           await supabase.from("seekers")
             .update({ is_active: false })
             .eq("email_hash", email.sender_hash);
           break;
         case "extend_search":
           await supabase.from("seekers")
             .update({ expires_at: new Date(Date.now() + 30 * 86400000).toISOString() })
             .eq("email_hash", email.sender_hash);
           break;
       }

       // Mark email as read in Gmail
       await markEmailRead(email.id);

       // Log run
       await supabase.from("agent_runs").insert({
         agent_type: "email_loop",
         model: "claude-sonnet-4-5",
         input_tokens: response.usage.input_tokens,
         output_tokens: response.usage.output_tokens,
         action_summary: { intent: intent.intent, email_id: email.id },
       });
     }
   }
   ```

4. **Cron trigger**
   Add to `vercel.json`:
   ```json
   { "path": "/api/agents/email-loop", "schedule": "*/10 * * * *" }
   ```
   Runs every 10 minutes. Processes up to 50 unread replies per run.

**Stage 6 checkpoint:** Send a reply email to `loop@bengaluru.rent` saying "I rented it!". Within 10 minutes, the corresponding listing is deactivated in Supabase.

---

### STAGE 7 — Watchlist, Ratings & Newsletter

**Goal:** Users can set area alerts, rate localities, and sign up for updates.

#### Tasks:

1. **Watchlist Registration**
   - `"🔔 Alert me for this area"` button on the map (area right-click or from Area Stats panel).
   - `<WatchlistForm>` drawer: email, radius, optional BHK/max rent filters.
   - `POST /api/watchlist` — validates, stores in `watchlist` table.
   - **Trigger alerts on new listing**: In `POST /api/listings`, after insert, query `watchlist` table using `ST_DWithin` for entries within the listing's location. Send a Resend email to matching watchers.

2. **Rating System**
   - In `<PinInfoPopup>`, below the pin details: "Rate this area" with two 1–5 star inputs: "Neighbourhood quality" and "Building quality".
   - `POST /api/ratings` — insert into `ratings` table (unique on `pin_id + session_id`).
   - Aggregate: show average locality score on each pin's popup if >= 3 ratings exist.

3. **Newsletter Signup**
   - Floating bottom banner (dismiss once per session): "Stay in the loop — get area rent trends monthly".
   - `POST /api/newsletter` — validate email, upsert into `newsletter` table.

**Stage 7 checkpoint:** Register on the watchlist. Add a new listing nearby. Verify the alert email arrives within seconds.

---

### STAGE 8 — Admin Dashboard, Monitoring & Production Hardening

**Goal:** A simple `/admin` page showing agent costs, system health, and moderation controls. Sentry for errors.

#### Tasks:

1. **`/admin` page (protected)**
   - Basic protection: single `ADMIN_SECRET` cookie checked server-side. Not a full auth system — this is an internal tool.
   - Display:
     - **Agent Costs Panel**: Query `agent_runs` for last 30 days. Show total cost by agent type, tokens used, runs count. Chart by day.
     - **System Stats**: Total pins (active/hidden/suspicious), total listings, total seekers, total matches, total emails sent.
     - **Recent Moderation**: Last 20 comment moderation decisions (pin ID, comment snippet, safe/unsafe, reason).
     - **IP Bans**: List of banned IPs with reason, ability to add/remove.
     - **Recent Reports**: Pins with report_count > 0, with "Mark suspicious" and "Clear reports" actions.

2. **Sentry Integration**
   ```bash
   npm i @sentry/nextjs
   npx @sentry/wizard@latest -i nextjs
   ```
   Wrap all Route Handlers in try-catch with `Sentry.captureException`. Wrap agent runs. Set up a Sentry alert for errors > 5/min.

3. **Coordinate privacy audit**
   Verify that no Route Handler response ever returns a coordinate with more than 4 decimal places. Add a utility:
   ```typescript
   export const roundCoord = (n: number) => Math.round(n * 10000) / 10000;
   ```
   Apply to all `lat`/`lng` fields in API responses.

4. **Google Maps API key billing alert**
   In Google Cloud Console: Billing → Budgets & Alerts → Set alert at ₹5,000/month. Restrict key to `bengaluru.rent` HTTP referrers.

5. **SEO — Neighbourhood pages**
   `app/[neighbourhood]/page.tsx` — Server-side rendered. Fetch median rents for the neighbourhood from Supabase. Render a static page: "Rent prices in Koramangala, Bengaluru — Average 2BHK: ₹35,000/month based on X community-submitted rent data points."
   Generate static params for top 30 Bengaluru neighbourhoods. These rank well on Google for "koramangala rent 2024".

6. **Production checklist**
   Before go-live, verify each item:
   - [ ] Supabase RLS: `SELECT` on listings never returns `owner_email` or `owner_phone` columns (even encrypted)
   - [ ] Service role key is only referenced in server-side code (Route Handlers, lib/supabase/server.ts)
   - [ ] All write operations are behind Route Handlers (no direct Supabase client writes from browser)
   - [ ] GIST indexes exist on `pins.geom`, `seekers.geom`, `watchlist.geom`
   - [ ] Vercel Cron routes are protected by `CRON_SECRET`
   - [ ] Sentry is capturing errors in both server and client
   - [ ] Rate limiting is tested: 3 pins per IP per 24h blocks on the 4th
   - [ ] Google Maps API key has HTTP referrer restrictions
   - [ ] Email/phone data is encrypted at rest in Supabase
   - [ ] No `console.log` statements containing user data in production

**Stage 8 checkpoint:** `/admin` shows real cost data. Sentry dashboard shows zero errors. All checklist items pass.

---

## 6. Key Design Principles to Preserve

These are non-negotiable product decisions from the original:

1. **Zero friction identity.** No sign-up form. No "create an account" barrier. A visitor's anonymous session is created silently on first load. This is the product's superpower.

2. **Map-first UX.** The map is not a feature — it is the product. Every interaction either starts on the map or returns to it. Keep the map full-screen.

3. **Drop a pin in under 60 seconds.** The form must be short. Resist the urge to add fields. If it takes more than 3 taps to submit a pin on mobile, it's too slow.

4. **Real data only.** The spam detection, Haiku moderation, report system, and suspicious-pin flagging all exist to protect data quality. Never let scale degrade the quality of what's on the map.

5. **Community as a feature.** The map stays honest because people flag bad data. Surface the community stats: "X pins reported in the last week", "Y comments moderated". It's trust infrastructure.

6. **AI as infrastructure, not a chatbot.** Claude does not appear in the UI. Users never "chat with AI". Claude runs nightly, reads emails, moderates comments — entirely in the background. This is the right mental model.

---

## 7. Testing Strategy

| Layer | What to test | How |
|---|---|---|
| Database | RLS policies, spatial queries | Supabase SQL editor + pgTAP |
| API Routes | Rate limiting, validation, auth | Vitest + MSW |
| AI Agents | Moderation classifier | Unit tests with fixture comments (30 edge cases) |
| Matching Agent | Match quality on seed data | Run agent on seeded seekers + listings, verify email count |
| Email Loop | Intent extraction | Unit tests for 10 reply patterns ("still looking", "found one", etc.) |
| E2E | Full pin drop → popup → report flow | Playwright |

---

## 8. Cost Estimates (Monthly, at ~5,000 active users)

| Item | Estimate |
|---|---|
| Supabase (Pro) | $25/month |
| Vercel (Pro) | $20/month |
| Google Maps API | ~₹3,000–5,000/month at 50k map loads |
| Resend | ~$10–20/month (10k emails) |
| Claude Haiku (moderation) | ~$1–3/month (100 comments/day × 200 tokens) |
| Claude Sonnet (matching + email) | ~$15–30/month (nightly + email loop) |
| Sentry | Free tier |
| **Total** | **~$80–100/month (~₹7,000–8,500)** |

---

*End of prompt. Begin with Stage 1. Do not proceed to Stage 2 until Stage 1 is deployed and verified.*