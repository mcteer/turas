-- Explicit owner migration for the separate recovery database only.
-- The wire/archive contract stays v1; this changes bounded capacity policy.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
LOCK TABLE turas_backup.contract IN EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT count(*) FROM turas_backup.contract)<>1
 OR NOT EXISTS(SELECT 1 FROM turas_backup.contract WHERE version='pilot-neon-archive-v1')
 OR current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass))
 THEN RAISE EXCEPTION 'Exact archive owner installation required'; END IF;
END $$;
ALTER TABLE turas_backup.contract ADD COLUMN IF NOT EXISTS capacity_policy_version smallint NOT NULL DEFAULT 1 CHECK(capacity_policy_version IN(1,2));
CREATE TABLE IF NOT EXISTS turas_backup.capacity_changes(
 installation_id uuid NOT NULL,policy_version smallint NOT NULL CHECK(policy_version=2),
 previous_maximum_bytes bigint NOT NULL CHECK(previous_maximum_bytes=209715200),
 maximum_bytes bigint NOT NULL CHECK(maximum_bytes=419430400),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(installation_id,policy_version)
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM turas_backup.contract WHERE capacity_policy_version=1 AND maximum_bytes=209715200) THEN
  ALTER TABLE turas_backup.contract DROP CONSTRAINT contract_maximum_bytes_check;
  ALTER TABLE turas_backup.contract ADD CONSTRAINT contract_maximum_bytes_check CHECK(maximum_bytes BETWEEN 1048576 AND 419430400);
  INSERT INTO turas_backup.capacity_changes(installation_id,policy_version,previous_maximum_bytes,maximum_bytes)
   SELECT installation_id,2,maximum_bytes,419430400 FROM turas_backup.contract;
  UPDATE turas_backup.contract SET maximum_bytes=419430400,capacity_policy_version=2;
  CREATE TRIGGER archive_capacity_immutable BEFORE UPDATE OR DELETE ON turas_backup.capacity_changes
   FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
 ELSIF NOT EXISTS(SELECT 1 FROM turas_backup.contract c JOIN turas_backup.capacity_changes h USING(installation_id)
  WHERE c.capacity_policy_version=2 AND c.maximum_bytes=419430400 AND h.policy_version=2)
 THEN RAISE EXCEPTION 'Archive capacity policy differs'; END IF;
END $$;
REVOKE ALL ON turas_backup.capacity_changes FROM PUBLIC;
COMMIT;
