CREATE TABLE atlas_cms_authorization (
  state_hash text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  provider text NOT NULL,
  actor_id text NOT NULL REFERENCES atlas_user(id),
  verifier_ref text NOT NULL,
  redirect_uri text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE atlas_cms_connection (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  provider text NOT NULL,
  credential_ref text NOT NULL,
  status text NOT NULL CHECK (status IN ('connected','syncing','error','disconnected')),
  access_mode text NOT NULL DEFAULT 'read_only' CHECK (access_mode IN ('read_only','read_write')),
  cursor jsonb,
  last_synced_at timestamptz,
  error_code text,
  created_by text NOT NULL REFERENCES atlas_user(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(workspace_id,provider)
);

CREATE TABLE atlas_cms_record_link (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  connection_id text NOT NULL REFERENCES atlas_cms_connection(id) ON DELETE CASCADE,
  external_type text NOT NULL,
  external_id text NOT NULL,
  atlas_object_id text NOT NULL REFERENCES atlas_object(id) ON DELETE CASCADE,
  source_updated_at timestamptz,
  source_checksum text,
  last_synced_at timestamptz NOT NULL,
  UNIQUE(connection_id,external_type,external_id)
);
CREATE INDEX atlas_cms_record_link_object_idx ON atlas_cms_record_link(atlas_object_id);
CREATE INDEX atlas_cms_connection_workspace_idx ON atlas_cms_connection(workspace_id,status);
