BEGIN;

CREATE TABLE atlas_workspace (
  id text PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE atlas_object (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  parent_object_id text REFERENCES atlas_object(id),
  dimension text NOT NULL CHECK (dimension IN ('matter','client','evidence','document','person','organization','operation')),
  type text NOT NULL,
  title text NOT NULL,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX atlas_object_workspace_idx ON atlas_object(workspace_id) WHERE deleted_at IS NULL;
CREATE INDEX atlas_object_parent_idx ON atlas_object(parent_object_id) WHERE deleted_at IS NULL;
CREATE INDEX atlas_object_kind_idx ON atlas_object(workspace_id, dimension, type) WHERE deleted_at IS NULL;

CREATE TABLE atlas_relationship (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  from_object_id text NOT NULL REFERENCES atlas_object(id),
  to_object_id text NOT NULL REFERENCES atlas_object(id),
  type text NOT NULL,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_object_id <> to_object_id),
  UNIQUE (workspace_id, from_object_id, to_object_id, type)
);

CREATE INDEX atlas_relationship_from_idx ON atlas_relationship(workspace_id, from_object_id);
CREATE INDEX atlas_relationship_to_idx ON atlas_relationship(workspace_id, to_object_id);

CREATE TABLE atlas_timeline_event (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  parent_object_id text REFERENCES atlas_object(id),
  type text NOT NULL,
  actor_id text NOT NULL,
  source text NOT NULL,
  confidence numeric(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  visibility text NOT NULL,
  related_object_ids text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_timeline_workspace_time_idx ON atlas_timeline_event(workspace_id, occurred_at DESC);
CREATE INDEX atlas_timeline_parent_time_idx ON atlas_timeline_event(parent_object_id, occurred_at DESC);

COMMIT;
