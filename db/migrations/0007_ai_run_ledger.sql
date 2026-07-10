CREATE TABLE atlas_ai_run (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES atlas_user(id),
  status text NOT NULL CHECK (status IN ('completed','failed')),
  prompt text NOT NULL,
  answer text,
  provider text,
  model text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  tool_calls integer NOT NULL DEFAULT 0 CHECK (tool_calls >= 0),
  usage jsonb NOT NULL DEFAULT '{"inputTokens":0,"outputTokens":0,"totalTokens":0}'::jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'completed' AND answer IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND answer IS NULL AND error_code IS NOT NULL))
);

CREATE INDEX atlas_ai_run_workspace_time_idx ON atlas_ai_run(workspace_id, created_at DESC);
CREATE INDEX atlas_ai_run_actor_time_idx ON atlas_ai_run(actor_id, created_at DESC);

CREATE FUNCTION atlas_reject_ai_run_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'atlas_ai_run is append-only';
END;
$$;

CREATE TRIGGER atlas_ai_run_no_update BEFORE UPDATE ON atlas_ai_run
FOR EACH ROW EXECUTE FUNCTION atlas_reject_ai_run_mutation();

CREATE TRIGGER atlas_ai_run_no_delete BEFORE DELETE ON atlas_ai_run
FOR EACH ROW EXECUTE FUNCTION atlas_reject_ai_run_mutation();
