CREATE TABLE atlas_rate_limit_bucket (
  key_hash text PRIMARY KEY CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  scope text NOT NULL CHECK (scope IN ('auth','ai','file','webhook','write')),
  request_count integer NOT NULL CHECK (request_count > 0),
  window_started_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (expires_at > window_started_at)
);

CREATE INDEX atlas_rate_limit_bucket_expiry_idx ON atlas_rate_limit_bucket(expires_at);
REVOKE ALL ON atlas_rate_limit_bucket FROM PUBLIC;
