ALTER TABLE atlas_ingestion_record DROP CONSTRAINT atlas_ingestion_record_kind_check;
ALTER TABLE atlas_ingestion_record ADD CONSTRAINT atlas_ingestion_record_kind_check
  CHECK (kind IN ('email','phone_call','document'));

CREATE OR REPLACE FUNCTION atlas_reject_timeline_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'timeline events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER atlas_timeline_no_update BEFORE UPDATE ON atlas_timeline_event
FOR EACH ROW EXECUTE FUNCTION atlas_reject_timeline_mutation();

CREATE TRIGGER atlas_timeline_no_delete BEFORE DELETE ON atlas_timeline_event
FOR EACH ROW EXECUTE FUNCTION atlas_reject_timeline_mutation();
