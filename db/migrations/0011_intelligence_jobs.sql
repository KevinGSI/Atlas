CREATE TABLE atlas_intelligence_job (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  trigger_type text NOT NULL,
  object_id text REFERENCES atlas_object(id),
  event_id text REFERENCES atlas_timeline_event(id),
  status text NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  payload jsonb NOT NULL,
  result jsonb,
  provider text,
  error_code text,
  available_at timestamptz NOT NULL,
  locked_at timestamptz,
  created_at timestamptz NOT NULL,
  completed_at timestamptz
);
CREATE INDEX atlas_intelligence_job_queue_idx ON atlas_intelligence_job(status,available_at,created_at);
CREATE INDEX atlas_intelligence_job_workspace_idx ON atlas_intelligence_job(workspace_id,created_at DESC);
