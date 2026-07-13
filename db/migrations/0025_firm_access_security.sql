ALTER TABLE atlas_workspace_membership
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz,
  ADD COLUMN deactivated_by text REFERENCES atlas_user(id),
  ADD COLUMN deactivation_reason text;

CREATE INDEX atlas_membership_workspace_active_idx
  ON atlas_workspace_membership(workspace_id,active,created_at);

CREATE TABLE atlas_workspace_security_policy (
  workspace_id text PRIMARY KEY REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  require_mfa boolean NOT NULL DEFAULT false,
  updated_by text REFERENCES atlas_user(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
