-- Migration: Add email hash columns for email loop matching

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS owner_email_hash text;

ALTER TABLE seekers
  ADD COLUMN IF NOT EXISTS email_hash text;

CREATE INDEX IF NOT EXISTS idx_listings_owner_email_hash ON listings(owner_email_hash);
CREATE INDEX IF NOT EXISTS idx_seekers_email_hash ON seekers(email_hash);

-- Recreate create_listing with hash column
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
  email_hash text;
BEGIN
  email_hash := encode(digest(lower(p_owner_email), 'sha256'), 'hex');

  INSERT INTO listings (
    pin_id, listing_type, rent_per_room, available_from,
    owner_email, owner_phone, owner_email_hash,
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
    email_hash,
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

-- Recreate create_seeker with hash column
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
  email_hash text;
BEGIN
  email_hash := encode(digest(lower(p_email), 'sha256'), 'hex');

  INSERT INTO seekers (
    geom, looking_for, budget_min, budget_max, bhk_pref,
    radius_km, email, phone, email_hash, gender, lifestyle_note, session_id
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
    email_hash,
    p_gender,
    NULLIF(trim(p_lifestyle_note), ''),
    p_session_id
  )
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

-- Optional backfill for existing rows
CREATE OR REPLACE FUNCTION backfill_email_hashes(
  p_encryption_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings
  SET owner_email_hash = encode(digest(lower(pgp_sym_decrypt(owner_email::bytea, p_encryption_key)), 'sha256'), 'hex')
  WHERE owner_email_hash IS NULL;

  UPDATE seekers
  SET email_hash = encode(digest(lower(pgp_sym_decrypt(email::bytea, p_encryption_key)), 'sha256'), 'hex')
  WHERE email_hash IS NULL;
END;
$$;
