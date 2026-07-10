CREATE TABLE atlas_password_reset (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES atlas_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX atlas_password_reset_user_idx ON atlas_password_reset(user_id, created_at DESC);
CREATE INDEX atlas_password_reset_active_idx ON atlas_password_reset(expires_at)
  WHERE used_at IS NULL;
