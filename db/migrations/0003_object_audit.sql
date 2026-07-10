CREATE TABLE atlas_audit_entry (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  object_id text NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('object.updated','object.deleted','object.restored')),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_audit_workspace_time_idx ON atlas_audit_entry(workspace_id, created_at DESC);
CREATE INDEX atlas_audit_object_time_idx ON atlas_audit_entry(object_id, created_at DESC);

CREATE FUNCTION atlas_reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'atlas_audit_entry is append-only';
END;
$$;

CREATE TRIGGER atlas_audit_no_update BEFORE UPDATE ON atlas_audit_entry
FOR EACH ROW EXECUTE FUNCTION atlas_reject_audit_mutation();

CREATE TRIGGER atlas_audit_no_delete BEFORE DELETE ON atlas_audit_entry
FOR EACH ROW EXECUTE FUNCTION atlas_reject_audit_mutation();
