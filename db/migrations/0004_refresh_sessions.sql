CREATE TABLE atlas_refresh_session (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES atlas_user(id) ON DELETE CASCADE,
  family_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  revoked_at timestamptz,
  replaced_by_session_id text REFERENCES atlas_refresh_session(id),
  CHECK (expires_at > created_at)
);

CREATE INDEX atlas_refresh_session_user_idx ON atlas_refresh_session(user_id, created_at DESC);
CREATE INDEX atlas_refresh_session_family_idx ON atlas_refresh_session(family_id);
CREATE INDEX atlas_refresh_session_active_idx ON atlas_refresh_session(expires_at)
  WHERE used_at IS NULL AND revoked_at IS NULL;
