-- Atomic report-a-pin function.
-- Inserts into reports (unique per pin+IP) and increments pins.report_count.
-- The existing trg_report_count trigger auto-hides at >= 3.

CREATE OR REPLACE FUNCTION report_pin(
  p_pin_id uuid,
  p_reporter_ip_hash text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert report (unique constraint will reject duplicates)
  INSERT INTO reports (pin_id, reporter_ip_hash, reason)
  VALUES (p_pin_id, p_reporter_ip_hash, p_reason);

  -- Increment report count on the pin
  UPDATE pins
  SET report_count = report_count + 1,
      updated_at = now()
  WHERE id = p_pin_id;
END;
$$;
