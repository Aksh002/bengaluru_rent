# bengaluru.rent

Anonymous rent transparency map for Bengaluru, rebuilt from the Stage 1 prompt.

## Stage 1 Status

- Next.js 15 App Router foundation
- Supabase anonymous session bootstrap
- `GET /api/pins` route with server-side Supabase access
- Coordinates rounded to 4 decimal places in API responses
- Full-screen Google Map centered on Bengaluru
- Supercluster-based pin clustering
- BHK-colored markers and rent popup
- Bengaluru-biased Google Places area search
- Initial Supabase migration applied

## Stage 2 Status

- Drop-a-pin placement mode on the map
- Bottom drawer rent submission form
- Anonymous-session protected `POST /api/pins`
- Server-side validation for Bengaluru bounds, rent, BHK, deposit, tenant preference
- Server-side IP hashing and 3-pins-per-24h rate limit
- PostGIS-safe `create_pin` RPC migration applied

Live Stage 2 verification requires a valid `SUPABASE_SERVICE_ROLE_KEY`. The anon key is public and used for browser auth; the service role key must come from Supabase Project Settings -> API -> `service_role`.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Fill in:

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
   - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` (optional; `DEMO_MAP_ID` is used locally)

4. Run the Supabase migration in `supabase/migrations/20260601100000_initial_schema.sql`.

5. Enable anonymous sign-ins in Supabase Auth providers.

6. Start the app:

   ```bash
   npm run dev
   ```

The local app runs at `http://127.0.0.1:3000` when started with `npm run dev`.
