-- Migration: Update public_pins view to drop session_id and include has_listing

CREATE OR REPLACE VIEW public_pins AS
SELECT
  p.id,
  p.geom,
  p.lat,
  p.lng,
  p.bhk,
  p.rent,
  p.furnished,
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
