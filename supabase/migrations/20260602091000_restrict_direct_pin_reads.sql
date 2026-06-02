-- Enforce coordinate privacy at the API layer.
-- Browser clients use /api/pins, which rounds lat/lng and omits geom/session_id.
-- Direct Supabase REST reads would expose exact coordinates, so revoke them.

REVOKE SELECT ON pins FROM anon, authenticated;
REVOKE SELECT ON public_pins FROM anon, authenticated;

GRANT SELECT ON pins TO service_role;
GRANT SELECT ON public_pins TO service_role;
