CREATE TABLE atlas_document_knowledge_embedding (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  observation_id text NOT NULL REFERENCES atlas_intelligence_observation(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0 AND dimensions <= 3072),
  embedding jsonb NOT NULL CHECK (jsonb_typeof(embedding) = 'array' AND jsonb_array_length(embedding) = dimensions),
  created_at timestamptz NOT NULL,
  UNIQUE (observation_id, provider, model)
);

CREATE INDEX atlas_document_knowledge_embedding_workspace_idx ON atlas_document_knowledge_embedding(workspace_id,model,created_at DESC);
REVOKE ALL ON atlas_document_knowledge_embedding FROM PUBLIC;
