CREATE TABLE atlas_user (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX atlas_user_email_unique_idx ON atlas_user (lower(email));

CREATE TABLE atlas_workspace_membership (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES atlas_user(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','member','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX atlas_membership_user_idx ON atlas_workspace_membership(user_id, workspace_id);
