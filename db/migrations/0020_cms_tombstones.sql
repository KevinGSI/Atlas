ALTER TABLE atlas_cms_record_link ADD COLUMN source_deleted_at timestamptz;
ALTER TABLE atlas_cms_record_link ADD COLUMN reconciliation_status text NOT NULL DEFAULT 'active'
  CHECK (reconciliation_status IN ('active','source_deleted','reviewed'));
CREATE INDEX atlas_cms_record_link_reconciliation_idx ON atlas_cms_record_link(workspace_id,reconciliation_status,last_synced_at);

