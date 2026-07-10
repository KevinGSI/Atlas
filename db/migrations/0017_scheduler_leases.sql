CREATE TABLE atlas_scheduler_lease (
  lease_key text PRIMARY KEY,
  owner_id text NOT NULL,
  acquired_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX atlas_scheduler_lease_expiry_idx ON atlas_scheduler_lease (expires_at);
