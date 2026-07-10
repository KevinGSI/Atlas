ALTER TABLE atlas_object ADD CONSTRAINT atlas_object_workspace_id_unique UNIQUE (workspace_id,id);

CREATE TABLE atlas_canonical_event (
  id text PRIMARY KEY REFERENCES atlas_timeline_event(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES atlas_workspace(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor_id text NOT NULL,
  source text NOT NULL,
  causation_id text REFERENCES atlas_canonical_event(id),
  correlation_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(workspace_id,id)
);

CREATE TABLE atlas_canonical_event_object (
  workspace_id text NOT NULL,
  event_id text NOT NULL,
  object_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('primary','affected')),
  PRIMARY KEY(event_id,object_id),
  FOREIGN KEY (workspace_id,event_id) REFERENCES atlas_canonical_event(workspace_id,id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id,object_id) REFERENCES atlas_object(workspace_id,id) ON DELETE CASCADE
);

CREATE TABLE atlas_canonical_event_delivery (
  event_id text NOT NULL REFERENCES atlas_canonical_event(id) ON DELETE CASCADE,
  consumer_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing','completed','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL,
  locked_at timestamptz,
  completed_at timestamptz,
  error_code text,
  PRIMARY KEY(event_id,consumer_id)
);

CREATE INDEX atlas_canonical_event_workspace_time_idx ON atlas_canonical_event(workspace_id,occurred_at,id);
CREATE INDEX atlas_canonical_event_object_idx ON atlas_canonical_event_object(workspace_id,object_id,event_id);
CREATE INDEX atlas_canonical_event_delivery_queue_idx ON atlas_canonical_event_delivery(consumer_id,status,available_at);
