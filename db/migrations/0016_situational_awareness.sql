CREATE TABLE atlas_awareness_item (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  target_user_id text REFERENCES atlas_user(id),
  source_job_id text NOT NULL UNIQUE REFERENCES atlas_intelligence_job(id) ON DELETE CASCADE,
  source_object_id text REFERENCES atlas_object(id),
  category text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('low','normal','high','urgent')),
  headline text NOT NULL,
  summary text NOT NULL,
  observation_ids text[] NOT NULL DEFAULT '{}',
  action_proposal_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL
);
CREATE INDEX atlas_awareness_item_home_idx ON atlas_awareness_item(workspace_id,target_user_id,created_at DESC);

CREATE TABLE atlas_awareness_receipt (
  item_id text NOT NULL REFERENCES atlas_awareness_item(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES atlas_user(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('seen','reviewed','dismissed')),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(item_id,user_id)
);

CREATE TABLE atlas_automation_marker (
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  marker_key text NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(workspace_id,marker_key)
);
