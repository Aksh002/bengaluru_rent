# bengaluru.rent

Anonymous rent transparency for Bengaluru.

`bengaluru.rent` is a map-first web app where real renters can anonymously drop rent pins and see what nearby homes actually cost. The product goal is simple: anyone in Bengaluru should be able to understand local rent reality in under 30 seconds, without a login wall, broker funnel, or personal exposure.

The app is built from the specification in `prompt.md` and has evolved beyond the initial Stage 1 map into a fuller rent intelligence product: anonymous sessions, server-validated pin submissions, available-flat listings, seeker registration, watchlists, ratings, pin comments, map layers, live stats, and background matching/email agents.

## Product Principles

- **Anonymous by default:** visitors get a Supabase anonymous session silently. No signup form is required for normal usage.
- **Map first:** the map is the product surface. Pins, filters, overlays, stats, listings, and search all orbit around the full-screen map.
- **Real rent data:** submissions are validated server-side, rate-limited, reportable, and moderated where needed.
- **Privacy-aware coordinates:** public API responses round coordinates to 4 decimal places before returning them to the browser.
- **AI in the background:** AI is infrastructure for moderation, matching, and email intent parsing. Users do not chat with a bot in the UI.
- **Deployable on Vercel:** the frontend and API routes are packaged as a Next.js app with Vercel Cron for scheduled agents.

## Current Feature Set

### Map Experience

- Full-screen Google Map centered on Bengaluru.
- BHK-colored rent markers.
- Supercluster-based marker clustering for zoomed-out views.
- Bounds-aware pin loading through `GET /api/pins`.
- Client-side filters for:
  - available flats only
  - BHK
  - furnishing
  - gated community
  - tenant preference
  - min/max rent
- Google Places area search biased toward Bengaluru.
- Metro and green-cover overlay toggles.
- NDVI ground overlay support through `NEXT_PUBLIC_NDVI_TILE_URL`.
- Bottom-left area rent summary and current map status.
- Live stats panel with visible-map rent summaries.

### Rent Pins

- Drop-a-pin flow with crosshair placement mode.
- Short rent form for rent, BHK, furnishing, gated status, society, tenant preference, deposit, and optional comment.
- Server-side validation for Bengaluru bounds and sane rent values.
- Anonymous session ownership for edit/delete permissions.
- IP-hash-based submission throttling.
- Current testing cap: 10 pins per 24 hours per hashed IP.
- Report flow for suspicious pins.
- Auto-hidden/suspicious data exclusion support in the database layer.

### Listings and Seekers

- "List my flat" flow that starts with a pin and then captures availability details.
- Listings support whole-flat and room availability.
- Owner contact fields are encrypted server-side.
- "Find a flat" flow for seekers with budget, radius, BHK, contact details, and preferences.
- Matching agent can pair active seekers with active listings.
- Available-flat mode shows only pins with active listings.

### Comments, Ratings, and Watchlists

- Users can comment on another user's pin.
- Comments are stored separately from the base pin record.
- Moderation queue/agent support exists through `pg-boss` and Anthropic.
- Users can rate pins for locality/build quality.
- Average ratings and rating counts are exposed on public pin data.
- Watchlist flow stores area alerts and can notify users when a matching listing appears nearby.

### Admin and Operations

- `/admin` dashboard protected by `ADMIN_SECRET`.
- Agent run logging through the `agent_runs` table.
- Matching and email-loop routes protected by `CRON_SECRET`.
- Sentry integration hooks are present for error monitoring.
- Vercel Cron is configured for Hobby-compatible daily schedules.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15 App Router |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Map SDK | `@vis.gl/react-google-maps` |
| Clustering | `supercluster` |
| Client state | Zustand |
| Server state/cache | TanStack Query |
| Database | Supabase Postgres with PostGIS and pgcrypto |
| Auth | Supabase Anonymous Auth |
| API layer | Next.js Route Handlers |
| Queue | `pg-boss` |
| AI agents | Anthropic SDK |
| Email | Resend and Gmail API integration |
| Monitoring | Sentry |
| Deployment | Vercel |

## Repository Map

```text
app/
  page.tsx                         Main home/map page
  [neighbourhood]/page.tsx         SEO neighbourhood rent pages
  admin/                           Protected admin dashboard and actions
  api/
    pins/                          Pin read/write/update/report/comment APIs
    listings/                      Active flat/room listing APIs
    seekers/                       Seeker registration API
    watchlist/                     Area alert API
    ratings/                       Pin rating API
    newsletter/                    Newsletter signup API
    agents/                        Cron-protected matching and email-loop APIs

components/
  map/                             Map shell, markers, overlays, filters, stats
  forms/                           Drop pin, listing, seeker, and watchlist forms
  GlassSurface.*                   Shared glass UI surface
  NewsletterBanner.tsx             Newsletter prompt

hooks/
  usePins.ts                       TanStack Query pin fetcher

lib/
  agents/                          Matching, moderation, and email intent agents
  queue/                           pg-boss queue bootstrap
  supabase/                        Browser/server Supabase clients and DB types
  utils/                           Coordinate and utility helpers
  types/                           Shared pin DTOs

store/
  map-store.ts                     Zustand map UI state

supabase/
  migrations/                      Ordered database migrations

public/
  data/namma-metro.geojson         Metro overlay source data

vercel.json                        Cron configuration
```

## Environment Variables

Copy `.env.example` to `.env.local` for local development, or set these in Vercel for production.

### Public Browser Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Browser-safe Supabase anon key for anonymous auth |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Yes | Browser Google Maps key for map rendering and Places search |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Recommended | Google Cloud vector map ID for styled maps/advanced markers |
| `NEXT_PUBLIC_NDVI_TILE_URL` | Optional | Public PNG/overlay URL for green-cover ground overlay |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Client Sentry DSN |

### Server Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only Supabase key used by route handlers |
| `DATABASE_URL` | Required for queue/agents | Direct Postgres connection string for `pg-boss` |
| `ENCRYPTION_KEY` | Yes for listings/seekers/watchlist | Secret used by database RPCs to encrypt/decrypt contact fields |
| `ADMIN_SECRET` | Yes for `/admin` | Secret protecting the admin dashboard |
| `CRON_SECRET` | Yes for cron routes | Bearer token required by agent endpoints |
| `IP_HASH_PEPPER` | Recommended | Pepper for one-way IP hashes |
| `GOOGLE_MAPS_GEOCODING_API_KEY` | Optional but recommended | Server key for reverse geocoding neighbourhood names |
| `ANTHROPIC_API_KEY` | Required for AI agents | Anthropic API key |
| `RESEND_API_KEY` | Required for outbound emails | Resend API key |
| `SENTRY_DSN` | Optional | Server Sentry DSN |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Optional | Sentry release/source-map upload config |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Optional | Gmail OAuth credentials for email-loop agent |

## Google Maps Setup

Create a Google Cloud project with billing enabled, then configure keys intentionally:

1. Enable **Maps JavaScript API**.
2. Enable **Places API** for the browser autocomplete search.
3. Enable **Geocoding API** if using server-side reverse geocoding.
4. Create a browser API key for `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
5. Restrict the browser key by HTTP referrer:
   - `http://localhost:3000/*`
   - `http://127.0.0.1:3000/*`
   - `https://your-vercel-domain.vercel.app/*`
   - `https://bengaluru.rent/*`
6. Restrict the browser key's APIs to **Maps JavaScript API** and **Places API**.
7. Create a separate server key for `GOOGLE_MAPS_GEOCODING_API_KEY` if possible, restricted to Geocoding API and appropriate server restrictions.
8. Create a Map ID and set `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`. The app falls back to `DEMO_MAP_ID`, but a real Map ID is preferred for production.

## Why Location Search May Not Work

The search box in `components/map/AreaSearch.tsx` uses this flow:

```tsx
const places = useMapsLibrary("places");
new places.Autocomplete(inputRef.current, { ... });
```

That means search depends on the **Places library inside Maps JavaScript**, not just the base map. A key can successfully render the map while search still fails.

Common causes:

- The key only has **Maps JavaScript API** enabled, but not **Places API**.
- Billing is not enabled on the Google Cloud project.
- API restrictions on the browser key do not include both Maps JavaScript API and Places API.
- HTTP referrer restrictions do not include the exact local origin, for example `http://localhost:3000/*` or `http://127.0.0.1:3000/*`.
- A Google sample/demo key or demo-only setup is being used. Demo values are fine for examples like `DEMO_MAP_ID`, but Places Autocomplete needs your own billable Google Cloud API key.
- The browser console has Google Maps errors such as `ApiNotActivatedMapError`, `RefererNotAllowedMapError`, `BillingNotEnabledMapError`, or `InvalidKeyMapError`.

In this app, if Places fails to load, `AreaSearch` simply returns early and the input behaves like a plain text box. The fastest check is to open DevTools Console and Network, type into the search box, and look for a blocked `maps.googleapis.com/maps/api/js?...libraries=places...` request or a Google Maps API error.

## Local Development

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env.local
```

Fill in the required Supabase and Google Maps variables. For local map search, make sure the browser key allows your exact local origin.

Run the app:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

Useful checks:

```bash
npm run lint
npm run typecheck
npm run build
```

## Database Setup

Run the Supabase migrations in order from `supabase/migrations`.

The schema includes:

- `pins` for anonymous rent submissions.
- `listings` for actively available flats/rooms.
- `seekers` for people looking for flats.
- `matches` for agent-generated matches.
- `reports` for community reports.
- `ratings` for pin/locality ratings.
- `watchlist` for area alerts.
- `newsletter` for monthly updates.
- `ip_bans` for abuse blocking.
- `agent_runs` for observability and cost tracking.
- `pin_comments` for community discussion on pins.
- public views/RPCs that avoid leaking private contact columns.

Required Postgres extensions:

- `postgis`
- `pgcrypto`
- `uuid-ossp`

Important database behavior:

- Public reads should go through safe views/RPCs, not direct sensitive tables.
- Contact fields are encrypted before storage.
- Spatial lookups use PostGIS.
- Pin coordinates returned to the client are rounded before response.
- Direct browser writes are avoided; writes go through API routes using server-side validation.

## API Routes

| Route | Methods | Purpose |
| --- | --- | --- |
| `/api/pins` | `GET`, `POST` | Fetch visible pins and create new rent pins |
| `/api/pins/[id]` | `PATCH`, `DELETE` | Owner-only pin updates/deletes |
| `/api/pins/[id]/report` | `POST` | Report a pin |
| `/api/pins/[id]/comments` | `GET`, `POST` | Read/add comments for a pin |
| `/api/listings` | `GET`, `POST` | Read active listings and create owner listings |
| `/api/seekers` | `POST` | Register a seeker for matching |
| `/api/watchlist` | `POST` | Register area/listing alerts |
| `/api/ratings` | `POST` | Submit pin ratings |
| `/api/newsletter` | `POST` | Newsletter signup |
| `/api/agents/match` | `GET`, `POST` | Cron-protected matching run |
| `/api/agents/email-loop` | `GET`, `POST` | Cron-protected email intent run |

## Cron Jobs

`vercel.json` currently uses Hobby-compatible daily schedules:

```json
{
  "crons": [
    { "path": "/api/agents/match", "schedule": "30 16 * * *" },
    { "path": "/api/agents/email-loop", "schedule": "45 16 * * *" }
  ]
}
```

Both routes require:

```http
Authorization: Bearer <CRON_SECRET>
```

Vercel Hobby accounts only allow daily cron schedules. More frequent email-loop processing requires Vercel Pro or an external scheduler.

## Deployment Checklist

Before deploying:

- Supabase anonymous auth is enabled.
- All migrations have been applied.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set.
- `SUPABASE_SERVICE_ROLE_KEY` is set only as a server/Vercel env var.
- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is a real browser key, not a demo/sample key.
- Maps JavaScript API and Places API are enabled for the browser key.
- Geocoding API is enabled for `GOOGLE_MAPS_GEOCODING_API_KEY` if reverse geocoding is desired.
- `ENCRYPTION_KEY`, `ADMIN_SECRET`, `CRON_SECRET`, and `IP_HASH_PEPPER` are strong random strings.
- `DATABASE_URL` is set if using `pg-boss`/agents.
- `ANTHROPIC_API_KEY` is set if matching/moderation/email agents should run.
- `RESEND_API_KEY` is set if emails should be sent.
- `NEXT_PUBLIC_NDVI_TILE_URL` points to a public image if green-cover overlay should appear.
- Sentry variables are set if release/error monitoring should be active.
- Vercel cron schedules match your account plan.
- Google API key restrictions include the final production domains.

## Privacy and Safety Notes

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `ENCRYPTION_KEY`, `ADMIN_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, or Gmail OAuth secrets to the browser.
- `NEXT_PUBLIC_*` variables are bundled into client-side JavaScript by design.
- Public pin responses should never include exact coordinates or raw IP data.
- Public listing responses should not expose encrypted or raw contact details.
- Route handlers are responsible for validation, authorization, and safe response shaping.

## Useful Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```

## Project Status

The app is in active pre-launch hardening. The core map, pin, listing, seeker, watchlist, ratings, comments, map-layer, and admin foundations are present. Remaining production work is mostly operational: final env configuration, hosted NDVI tile, Sentry verification, Google API key restrictions, real email sender/domain setup, and end-to-end smoke testing against the production Supabase project.
