-- Migration: Add encrypt_field utility
-- Utility to encrypt plain text using pgp_sym_encrypt for the email loop agent

CREATE OR REPLACE FUNCTION encrypt_field(
  plaintext text,
  encryption_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF plaintext IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(plaintext, encryption_key)::text;
END;
$$;
