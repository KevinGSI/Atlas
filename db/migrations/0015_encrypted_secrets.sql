CREATE TABLE atlas_encrypted_secret (
  id text PRIMARY KEY,
  purpose text NOT NULL,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON atlas_encrypted_secret FROM PUBLIC;
