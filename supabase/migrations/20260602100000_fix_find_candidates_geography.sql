-- Fix matching candidate spatial comparison and exclude suspicious pins.
-- The previous function compared pins.geom geometry to a geography value, which
-- can fail at runtime depending on PostGIS overload resolution.

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
    AND p.is_suspicious = false
    AND COALESCE(l.rent_per_room, p.rent) <= budget_max
    AND ST_DWithin(
      p.geom::geography,
      ST_SetSRID(ST_MakePoint(seeker_lng, seeker_lat), 4326)::geography,
      radius_km * 1000
    )
$$ LANGUAGE sql SECURITY DEFINER;
