CREATE TABLE atlas_document_knowledge_chunk (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  source_object_id text NOT NULL,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  content text NOT NULL,
  source_location jsonb,
  provider text NOT NULL,
  model text NOT NULL,
  dimensions integer NOT NULL CHECK (dimensions > 0 AND dimensions <= 3072),
  embedding jsonb NOT NULL CHECK (jsonb_typeof(embedding) = 'array' AND jsonb_array_length(embedding) = dimensions),
  created_at timestamptz NOT NULL,
  FOREIGN KEY (workspace_id, source_object_id) REFERENCES atlas_object(workspace_id,id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source_object_id, model, ordinal)
);

CREATE INDEX atlas_document_knowledge_chunk_workspace_idx ON atlas_document_knowledge_chunk(workspace_id,model,created_at DESC);
REVOKE ALL ON atlas_document_knowledge_chunk FROM PUBLIC;
