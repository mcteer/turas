-- Explicit owner migration in the independent work archive only.
-- A retained denial/replay snapshot is not evidence of later/current authority.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
LOCK TABLE turas_backup.contract IN EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT count(*) FROM turas_backup.contract)<>1 OR NOT EXISTS(
  SELECT 1 FROM turas_backup.contract WHERE version='pilot-neon-archive-v1' AND capacity_policy_version=2)
 OR current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass))
 THEN RAISE EXCEPTION 'Exact archive owner capacity installation required';END IF;
END $$;
CREATE TABLE IF NOT EXISTS turas_backup.authority_holds(
 archive_id uuid PRIMARY KEY REFERENCES turas_backup.archives(id),
 kind text NOT NULL CHECK(kind='denial-replay-snapshot'),
 context_digest text NOT NULL CHECK(context_digest ~ '^[a-f0-9]{64}$'),
 retained_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE OR REPLACE FUNCTION turas_backup.authority_hold_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='turas_backup.contract'::regclass)) THEN
  RAISE EXCEPTION 'Independent authority retention requires archive owner' USING ERRCODE='42501';END IF;
 LOCK TABLE turas_backup.archives IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM turas_backup.archives WHERE id=NEW.archive_id AND header_digest=NEW.context_digest
  AND captured_at<=clock_timestamp() AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'Exact unexpired authority archive context required' USING ERRCODE='23514';END IF;
 NEW.retained_at:=clock_timestamp();RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='turas_backup.authority_holds'::regclass AND tgname='authority_hold_immutable') THEN
  CREATE TRIGGER authority_hold_immutable BEFORE UPDATE OR DELETE ON turas_backup.authority_holds
   FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='turas_backup.authority_holds'::regclass AND tgname='authority_hold_admission') THEN
  CREATE TRIGGER authority_hold_admission BEFORE INSERT ON turas_backup.authority_holds FOR EACH ROW EXECUTE FUNCTION turas_backup.authority_hold_admission();
 END IF;
END $$;
CREATE OR REPLACE FUNCTION turas_backup.expiry_fence() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expiry timestamptz; archive_identity uuid;
BEGIN
 IF TG_TABLE_NAME='archives' THEN archive_identity:=OLD.id;ELSE archive_identity:=OLD.archive_id;END IF;
 IF EXISTS(SELECT 1 FROM turas_backup.authority_holds WHERE archive_id=archive_identity) THEN
  RAISE EXCEPTION 'Independent denial replay snapshot is permanently retained' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='archives' THEN expiry:=OLD.expires_at;
 ELSE SELECT expires_at INTO STRICT expiry FROM turas_backup.archives WHERE id=OLD.archive_id;END IF;
 IF expiry>clock_timestamp() THEN RAISE EXCEPTION 'Managed recovery archive has not expired' USING ERRCODE='23514';END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON turas_backup.authority_holds FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.authority_hold_admission() FROM PUBLIC;
COMMIT;
