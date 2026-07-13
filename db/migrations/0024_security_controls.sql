CREATE TABLE atlas_mfa_factor (
  user_id text PRIMARY KEY REFERENCES atlas_user(id) ON DELETE CASCADE,
  encrypted_secret text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(recovery_code_hashes) = 'array')
);

CREATE TABLE atlas_security_event (
  id text PRIMARY KEY,
  user_id text REFERENCES atlas_user(id) ON DELETE SET NULL,
  workspace_id text REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  type text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success','failure','blocked')),
  ip_address text,
  user_agent text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_security_event_user_idx ON atlas_security_event(user_id,created_at DESC);
CREATE INDEX atlas_security_event_workspace_idx ON atlas_security_event(workspace_id,created_at DESC);

CREATE FUNCTION atlas_security_event_no_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'security events are append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER atlas_security_event_no_update BEFORE UPDATE ON atlas_security_event FOR EACH ROW EXECUTE FUNCTION atlas_security_event_no_mutation();
CREATE TRIGGER atlas_security_event_no_delete BEFORE DELETE ON atlas_security_event FOR EACH ROW EXECUTE FUNCTION atlas_security_event_no_mutation();
