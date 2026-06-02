-- Helper RPC: get active seekers with their coordinates extracted from PostGIS geometry.
-- The matching agent needs lat/lng but the seekers table stores geom (PostGIS Point).

CREATE OR REPLACE FUNCTION get_active_seekers_with_coords()
RETURNS TABLE (
  id uuid,
  lat float8,
  lng float8,
  looking_for text,
  budget_min int4,
  budget_max int4,
  bhk_pref int2,
  radius_km float4,
  email text,
  phone text,
  gender text,
  lifestyle_note text,
  expires_at timestamptz,
  is_active bool,
  session_id uuid,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id,
    ST_Y(s.geom) AS lat,
    ST_X(s.geom) AS lng,
    s.looking_for,
    s.budget_min,
    s.budget_max,
    s.bhk_pref,
    s.radius_km,
    s.email,
    s.phone,
    s.gender,
    s.lifestyle_note,
    s.expires_at,
    s.is_active,
    s.session_id,
    s.created_at
  FROM seekers s
  WHERE s.is_active = true
    AND s.expires_at > now()
  ORDER BY s.created_at DESC;
$$;
