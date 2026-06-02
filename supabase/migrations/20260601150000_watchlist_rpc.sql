-- Migration: Add watchlist RPC
-- Helper to create a watchlist entry with encrypted contact info and PostGIS geometry

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
SET search_path = public
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
    pgp_sym_encrypt(p_email, p_encryption_key),
    CASE WHEN p_phone IS NOT NULL AND p_phone <> ''
      THEN pgp_sym_encrypt(p_phone, p_encryption_key)
      ELSE NULL
    END
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;
