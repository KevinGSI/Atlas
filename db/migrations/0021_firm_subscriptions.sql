CREATE TABLE atlas_subscription (
  id text PRIMARY KEY,
  workspace_id text NOT NULL UNIQUE REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('pilot','professional','enterprise')),
  status text NOT NULL CHECK (status IN ('trialing','active','past_due','suspended','canceled')),
  seat_limit integer NOT NULL CHECK (seat_limit > 0),
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE INDEX atlas_subscription_status_idx ON atlas_subscription(status, current_period_ends_at);

-- Existing firms receive the pilot entitlement during the upgrade. This keeps
-- authorization fail-closed without locking out tenants created before billing.
INSERT INTO atlas_subscription (id,workspace_id,plan,status,seat_limit,created_at,updated_at)
SELECT 'sub_' || md5(id), id, 'pilot', 'trialing', 10, now(), now()
FROM atlas_workspace;
