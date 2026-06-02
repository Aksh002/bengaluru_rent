-- Prompt alignment fixes:
-- - add 3-state furnishing while keeping legacy furnished bool
-- - ensure public_pins never exposes session_id and exposes active listing status
-- - let create_pin populate neighbourhood in one transaction

ALTER TABLE pins
  ADD COLUMN IF NOT EXISTS furnishing text NOT NULL DEFAULT 'unfurnished'
  CHECK (furnishing IN ('furnished', 'semi', 'unfurnished'));

UPDATE pins
SET furnishing = CASE WHEN furnished THEN 'furnished' ELSE 'unfurnished' END
WHERE furnishing IS NULL OR furnishing = 'unfurnished';

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
  p_ip_hash text,
  p_furnishing text DEFAULT 'unfurnished',
  p_neighbourhood text DEFAULT NULL
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
    furnishing,
    gated,
    society_name,
    occupant_type,
    deposit_months,
    comment,
    comment_approved,
    session_id,
    ip_hash,
    neighbourhood
  )
  VALUES (
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326),
    p_lat,
    p_lng,
    p_bhk,
    p_rent,
    COALESCE(p_furnished, false),
    COALESCE(NULLIF(p_furnishing, ''), CASE WHEN p_furnished THEN 'furnished' ELSE 'unfurnished' END),
    p_gated,
    NULLIF(trim(p_society_name), ''),
    p_occupant_type,
    p_deposit_months,
    NULLIF(trim(p_comment), ''),
    CASE WHEN NULLIF(trim(p_comment), '') IS NULL THEN true ELSE NULL END,
    p_session_id,
    p_ip_hash,
    NULLIF(trim(p_neighbourhood), '')
  )
  RETURNING * INTO created_pin;

  RETURN created_pin;
END;
$$;

DROP VIEW IF EXISTS public_pins;

CREATE VIEW public_pins AS
SELECT
  p.id,
  p.geom,
  p.lat,
  p.lng,
  p.bhk,
  p.rent,
  p.furnished,
  p.furnishing,
  p.gated,
  p.society_name,
  p.occupant_type,
  p.deposit_months,
  p.comment,
  p.comment_approved,
  p.report_count,
  p.is_hidden,
  p.is_suspicious,
  p.neighbourhood,
  p.created_at,
  p.updated_at,
  COALESCE(r.rating_count, 0) as rating_count,
  r.rating_avg,
  CASE WHEN l.pin_id IS NULL THEN false ELSE true END as has_listing
FROM pins p
LEFT JOIN (
  SELECT pin_id,
         count(*) as rating_count,
         round(avg(locality_score), 1) as rating_avg
  FROM ratings
  GROUP BY pin_id
) r ON p.id = r.pin_id
LEFT JOIN (
  SELECT DISTINCT pin_id
  FROM listings
  WHERE is_active = true
) l ON p.id = l.pin_id;
