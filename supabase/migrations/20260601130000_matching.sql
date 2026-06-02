-- Migration: Matching infrastructure
-- Adds RPC functions for creating listings, creating seekers, and finding candidates.

-- ============================================================================
-- create_listing: Encrypts owner_email and owner_phone before insertion
-- ============================================================================
CREATE OR REPLACE FUNCTION create_listing(
  p_pin_id uuid,
  p_listing_type text,
  p_rent_per_room int4,
  p_available_from text,
  p_owner_email text,
  p_owner_phone text,
  p_gender_pref text,
  p_smoking_ok bool,
  p_food_pref text,
  p_parking_spots int2,
  p_session_id uuid,
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
  INSERT INTO listings (
    pin_id, listing_type, rent_per_room, available_from,
    owner_email, owner_phone,
    gender_pref, smoking_ok, food_pref, parking_spots, session_id
  )
  VALUES (
    p_pin_id,
    p_listing_type,
    p_rent_per_room,
    p_available_from,
    pgp_sym_encrypt(p_owner_email, p_encryption_key),
    CASE WHEN p_owner_phone IS NOT NULL AND p_owner_phone <> ''
      THEN pgp_sym_encrypt(p_owner_phone, p_encryption_key)
      ELSE NULL
    END,
    p_gender_pref,
    p_smoking_ok,
    p_food_pref,
    p_parking_spots,
    p_session_id
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ============================================================================
-- create_seeker: Encrypts email and phone, creates geometry from lat/lng
-- ============================================================================
CREATE OR REPLACE FUNCTION create_seeker(
  p_lat float8,
  p_lng float8,
  p_looking_for text,
  p_budget_min int4,
  p_budget_max int4,
  p_bhk_pref int2,
  p_radius_km float4,
  p_email text,
  p_phone text,
  p_gender text,
  p_lifestyle_note text,
  p_session_id uuid,
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
  INSERT INTO seekers (
    geom, looking_for, budget_min, budget_max, bhk_pref,
    radius_km, email, phone, gender, lifestyle_note, session_id
  )
  VALUES (
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    p_looking_for,
    p_budget_min,
    p_budget_max,
    p_bhk_pref,
    p_radius_km,
    pgp_sym_encrypt(p_email, p_encryption_key),
    CASE WHEN p_phone IS NOT NULL AND p_phone <> ''
      THEN pgp_sym_encrypt(p_phone, p_encryption_key)
      ELSE NULL
    END,
    p_gender,
    NULLIF(trim(p_lifestyle_note), ''),
    p_session_id
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- ============================================================================
-- find_candidates: PostGIS spatial pre-filter for matching agent
-- Returns active listings within seeker's radius and budget
-- ============================================================================
CREATE OR REPLACE FUNCTION find_candidates(
  seeker_lat float8,
  seeker_lng float8,
  radius_km float4,
  budget_max int4
)
RETURNS TABLE (
  id uuid,
  pin_id uuid,
  listing_type text,
  rent_per_room int4,
  available_from text,
  gender_pref text,
  smoking_ok bool,
  food_pref text,
  parking_spots int2,
  neighbourhood text,
  bhk int2,
  rent int4,
  furnished bool,
  lat float8,
  lng float8
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

-- ============================================================================
-- decrypt_field: Utility to decrypt pgp_sym_encrypt'd fields (server-only)
-- ============================================================================
CREATE OR REPLACE FUNCTION decrypt_field(
  encrypted_value text,
  encryption_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF encrypted_value IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_decrypt(encrypted_value::bytea, encryption_key);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
