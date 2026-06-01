CREATE INDEX IF NOT EXISTS idx_pins_ip_created ON pins(ip_hash, created_at DESC);

CREATE OR REPLACE FUNCTION create_pin(
  p_lat float8,
  p_lng float8,
  p_bhk int2,
  p_rent int4,
  p_furnished bool,
  p_gated bool,
  p_society_name text,
  p_occupant_type text,
  p_deposit_months int2,
  p_comment text,
  p_session_id uuid,
  p_ip_hash text
)
RETURNS pins
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  created_pin pins;
BEGIN
  INSERT INTO pins (
    geom,
    lat,
    lng,
    bhk,
    rent,
    furnished,
    gated,
    society_name,
    occupant_type,
    deposit_months,
    comment,
    comment_approved,
    session_id,
    ip_hash
  )
  VALUES (
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    p_lat,
    p_lng,
    p_bhk,
    p_rent,
    p_furnished,
    p_gated,
    NULLIF(trim(p_society_name), ''),
    p_occupant_type,
    p_deposit_months,
    NULLIF(trim(p_comment), ''),
    CASE WHEN NULLIF(trim(p_comment), '') IS NULL THEN true ELSE NULL END,
    p_session_id,
    p_ip_hash
  )
  RETURNING * INTO created_pin;

  RETURN created_pin;
END;
$$;
