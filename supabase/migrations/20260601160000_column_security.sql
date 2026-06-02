-- Migration: Column-level security for listings contact info
-- Ensure anon and authenticated roles cannot select owner_email or owner_phone

REVOKE SELECT ON listings FROM anon, authenticated;

-- Grant select only on non-sensitive columns
GRANT SELECT (
  id, pin_id, listing_type, rent_per_room, available_from,
  gender_pref, smoking_ok, food_pref, parking_spots,
  is_active, session_id, created_at
) ON listings TO anon, authenticated;

-- Ensure service_role still has full access
GRANT ALL ON listings TO service_role;
