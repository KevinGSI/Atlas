CREATE TABLE atlas_ai_action_proposal (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  run_id text NOT NULL REFERENCES atlas_ai_run(id),
  proposed_by text NOT NULL REFERENCES atlas_user(id),
  action_type text NOT NULL CHECK (action_type IN ('create_task')),
  input jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  decided_by text REFERENCES atlas_user(id),
  result_object_id text REFERENCES atlas_object(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL AND result_object_id IS NULL)
    OR (status='rejected' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND result_object_id IS NULL)
    OR (status='approved' AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND result_object_id IS NOT NULL))
);
CREATE INDEX atlas_ai_action_proposal_workspace_status_idx ON atlas_ai_action_proposal(workspace_id,status,created_at DESC);
CREATE INDEX atlas_ai_action_proposal_run_idx ON atlas_ai_action_proposal(run_id);
