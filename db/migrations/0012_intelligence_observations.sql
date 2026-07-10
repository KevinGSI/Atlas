ALTER TABLE atlas_ai_action_proposal ALTER COLUMN run_id DROP NOT NULL;
ALTER TABLE atlas_ai_action_proposal ALTER COLUMN proposed_by DROP NOT NULL;
ALTER TABLE atlas_ai_action_proposal ADD COLUMN intelligence_job_id text REFERENCES atlas_intelligence_job(id);
ALTER TABLE atlas_ai_action_proposal ADD COLUMN origin_type text NOT NULL DEFAULT 'chat' CHECK (origin_type IN ('chat','intelligence'));
ALTER TABLE atlas_ai_action_proposal ADD CONSTRAINT atlas_ai_action_proposal_origin_check CHECK (
  (origin_type='chat' AND run_id IS NOT NULL AND intelligence_job_id IS NULL AND proposed_by IS NOT NULL)
  OR (origin_type='intelligence' AND run_id IS NULL AND intelligence_job_id IS NOT NULL)
);
CREATE INDEX atlas_ai_action_proposal_intelligence_job_idx ON atlas_ai_action_proposal(intelligence_job_id);

CREATE TABLE atlas_intelligence_observation (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  job_id text NOT NULL REFERENCES atlas_intelligence_job(id) ON DELETE CASCADE,
  source_object_id text REFERENCES atlas_object(id),
  kind text NOT NULL CHECK (kind IN ('classification','entity','matter_match','fact','deadline','duty','conflict','risk','recommendation')),
  data jsonb NOT NULL,
  confidence numeric(5,4) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  source_location jsonb,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate','accepted','rejected')),
  reviewed_by text REFERENCES atlas_user(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status='candidate' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (status IN ('accepted','rejected') AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX atlas_intelligence_observation_review_idx ON atlas_intelligence_observation(workspace_id,status,created_at DESC);
CREATE INDEX atlas_intelligence_observation_source_idx ON atlas_intelligence_observation(source_object_id,kind);
