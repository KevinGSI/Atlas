CREATE TABLE atlas_ai_conversation (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES atlas_user(id),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_ai_conversation_owner_idx ON atlas_ai_conversation(workspace_id,actor_id,created_at DESC);

CREATE TABLE atlas_ai_message (
  id text PRIMARY KEY,
  conversation_id text NOT NULL REFERENCES atlas_ai_conversation(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES atlas_user(id),
  run_id text REFERENCES atlas_ai_run(id),
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX atlas_ai_message_conversation_idx ON atlas_ai_message(conversation_id,created_at,id);

CREATE TRIGGER atlas_ai_message_no_update BEFORE UPDATE ON atlas_ai_message FOR EACH ROW EXECUTE FUNCTION atlas_reject_ai_run_mutation();
CREATE TRIGGER atlas_ai_message_no_delete BEFORE DELETE ON atlas_ai_message FOR EACH ROW EXECUTE FUNCTION atlas_reject_ai_run_mutation();
