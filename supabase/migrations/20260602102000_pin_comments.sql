CREATE TABLE IF NOT EXISTS pin_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pin_id uuid NOT NULL REFERENCES pins(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  comment_approved bool DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pin_comments_pin_created
  ON pin_comments (pin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pin_comments_session_created
  ON pin_comments (session_id, created_at DESC);

ALTER TABLE pin_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pin_comments_approved_read" ON pin_comments;
CREATE POLICY "pin_comments_approved_read" ON pin_comments
  FOR SELECT
  USING (comment_approved IS TRUE);

DROP POLICY IF EXISTS "pin_comments_own_insert" ON pin_comments;
CREATE POLICY "pin_comments_own_insert" ON pin_comments
  FOR INSERT
  WITH CHECK (auth.uid() = session_id);
