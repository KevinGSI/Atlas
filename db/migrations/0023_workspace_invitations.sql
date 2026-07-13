CREATE TABLE atlas_workspace_invitation (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','attorney','paralegal','billing','member','viewer')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('pending','accepted','canceled')),
  invited_by text NOT NULL REFERENCES atlas_user(id),
  accepted_by text REFERENCES atlas_user(id),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  accepted_at timestamptz
);

CREATE INDEX atlas_workspace_invitation_workspace_idx
  ON atlas_workspace_invitation(workspace_id, status, expires_at);

CREATE UNIQUE INDEX atlas_workspace_invitation_pending_email_idx
  ON atlas_workspace_invitation(workspace_id, lower(email))
  WHERE status = 'pending';
