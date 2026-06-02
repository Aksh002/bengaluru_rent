-- Migration: Add get_watchlist_matches RPC
-- Helper to find watchlist entries matching a new listing

CREATE OR REPLACE FUNCTION get_watchlist_matches(
  p_pin_id uuid,
  p_bhk int2,
  p_rent int4
)
RETURNS TABLE (
  id uuid,
  email text,
  phone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id, w.email, w.phone
  FROM watchlist w
  JOIN pins p ON p.id = p_pin_id
  WHERE w.expires_at > now()
    AND (w.bhk_pref IS NULL OR w.bhk_pref = p_bhk)
    AND (w.max_rent IS NULL OR w.max_rent >= p_rent)
    AND ST_DWithin(
      w.geom::geography,
      ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography,
      w.radius_km * 1000
    )
$$;
