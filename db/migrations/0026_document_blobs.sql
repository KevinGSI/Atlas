CREATE TABLE atlas_document_blob (
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL,
  size bigint NOT NULL CHECK (size >= 0 AND size = octet_length(content)),
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, sha256)
);

REVOKE ALL ON atlas_document_blob FROM PUBLIC;
