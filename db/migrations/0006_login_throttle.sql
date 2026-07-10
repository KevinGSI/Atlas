CREATE TABLE atlas_login_throttle (
  principal_hash text PRIMARY KEY,
  failed_count integer NOT NULL CHECK (failed_count > 0),
  window_started_at timestamptz NOT NULL,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL
);

CREATE INDEX atlas_login_throttle_locked_idx ON atlas_login_throttle(locked_until)
  WHERE locked_until IS NOT NULL;
