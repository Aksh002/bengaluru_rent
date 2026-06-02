-- Repair watchlist RPCs on deployments that missed the original watchlist
-- migration, and make pgcrypto resolution work on Supabase's extensions schema.

CREATE OR REPLACE FUNCTION create_watchlist_entry(
  p_lat float8,
  p_lng float8,
  p_radius_km float4,
  p_bhk_pref int2,
  p_max_rent int4,
  p_email text,
  p_phone text,
  p_encryption_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id uuid;
BEGIN
  INSERT INTO watchlist (
    geom, radius_km, bhk_pref, max_rent, email, phone
  )
  VALUES (
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    p_radius_km,
    p_bhk_pref,
    p_max_rent,
    pgp_sym_encrypt(p_email, p_encryption_key)::text,
    CASE WHEN p_phone IS NOT NULL AND p_phone <> ''
      THEN pgp_sym_encrypt(p_phone, p_encryption_key)::text
      ELSE NULL
    END
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

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
SET search_path = public, extensions
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

NOTIFY pgrst, 'reload schema';
