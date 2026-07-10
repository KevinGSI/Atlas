CREATE TABLE atlas_ingestion_record (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  connector text NOT NULL,
  external_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('email')),
  status text NOT NULL CHECK (status IN ('accepted','cataloged','failed')),
  root_object_id text REFERENCES atlas_object(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  received_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(workspace_id,connector,external_id)
);
CREATE INDEX atlas_ingestion_record_workspace_time_idx ON atlas_ingestion_record(workspace_id,received_at DESC);
