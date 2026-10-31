-- Explicit archive-owner migration in the separate recovery database only.
-- Existing archives, seven-day expiry and immutable financial history survive.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
LOCK TABLE turas_backup.contract IN EXCLUSIVE MODE;
LOCK TABLE turas_backup.archives, turas_backup.chunks IN EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT count(*) FROM turas_backup.contract)<>1
 OR NOT EXISTS(SELECT 1 FROM turas_backup.contract
   WHERE version='pilot-neon-archive-v1'
     AND ((capacity_policy_version=2 AND maximum_bytes=419430400)
       OR (capacity_policy_version=3 AND maximum_bytes=6442450944)))
 OR current_user<>pg_get_userbyid((SELECT relowner FROM pg_class
   WHERE oid='turas_backup.contract'::regclass))
 THEN RAISE EXCEPTION 'Exact archive owner and prior capacity policy required'; END IF;
END $$;
ALTER TABLE turas_backup.contract DROP CONSTRAINT contract_capacity_policy_version_check;
ALTER TABLE turas_backup.contract ADD CONSTRAINT contract_capacity_policy_version_check
 CHECK(capacity_policy_version IN(1,2,3));
ALTER TABLE turas_backup.contract DROP CONSTRAINT contract_maximum_bytes_check;
ALTER TABLE turas_backup.contract ADD CONSTRAINT contract_maximum_bytes_check
 CHECK(maximum_bytes BETWEEN 1048576 AND 6442450944);
ALTER TABLE turas_backup.archives DROP CONSTRAINT archives_size_bytes_check;
ALTER TABLE turas_backup.archives ADD CONSTRAINT archives_size_bytes_check
 CHECK(size_bytes BETWEEN 68 AND 335544320);
ALTER TABLE turas_backup.archives DROP CONSTRAINT archives_chunk_count_check;
ALTER TABLE turas_backup.archives ADD CONSTRAINT archives_chunk_count_check
 CHECK(chunk_count BETWEEN 1 AND 320);
ALTER TABLE turas_backup.chunks DROP CONSTRAINT chunks_ordinal_check;
ALTER TABLE turas_backup.chunks ADD CONSTRAINT chunks_ordinal_check
 CHECK(ordinal BETWEEN 0 AND 319);
CREATE TABLE IF NOT EXISTS turas_backup.complete_capture_capacity_changes(
 installation_id uuid PRIMARY KEY,
 policy_version smallint NOT NULL CHECK(policy_version=3),
 previous_maximum_bytes bigint NOT NULL CHECK(previous_maximum_bytes=419430400),
 maximum_bytes bigint NOT NULL CHECK(maximum_bytes=6442450944),
 maximum_archive_bytes bigint NOT NULL CHECK(maximum_archive_bytes=335544320),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM turas_backup.contract WHERE capacity_policy_version=2) THEN
  INSERT INTO turas_backup.complete_capture_capacity_changes
   (installation_id,policy_version,previous_maximum_bytes,maximum_bytes,maximum_archive_bytes)
   SELECT installation_id,3,maximum_bytes,6442450944,335544320 FROM turas_backup.contract;
  UPDATE turas_backup.contract SET maximum_bytes=6442450944,capacity_policy_version=3;
  CREATE TRIGGER complete_capture_capacity_immutable
   BEFORE UPDATE OR DELETE ON turas_backup.complete_capture_capacity_changes
   FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
 ELSIF NOT EXISTS(SELECT 1 FROM turas_backup.contract c
   JOIN turas_backup.complete_capture_capacity_changes h USING(installation_id)
   WHERE c.capacity_policy_version=3 AND c.maximum_bytes=h.maximum_bytes)
 THEN RAISE EXCEPTION 'Complete capture capacity policy differs'; END IF;
END $$;
REVOKE ALL ON turas_backup.complete_capture_capacity_changes FROM PUBLIC;
COMMIT;
