-- Explicit owner migration in the independent work recovery database.
-- Minimal immutable capture audit outlives expiring encrypted backup bytes.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
CREATE TABLE turas_backup.capture_receipts (
 archive_id uuid PRIMARY KEY,
 installation_id uuid NOT NULL,
 source_project_id text NOT NULL CHECK(source_project_id ~ '^prj_[A-Za-z0-9]+$'),
 environment_id text NOT NULL,
 source_commit text NOT NULL CHECK(source_commit ~ '^[a-f0-9]{40}$'),
 source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
 catalog_digest text NOT NULL CHECK(catalog_digest ~ '^[a-f0-9]{64}$'),
 candidate_digest text NOT NULL CHECK(candidate_digest ~ '^[a-f0-9]{64}$'),
 key_reference text NOT NULL,key_version text NOT NULL,
 captured_at timestamptz NOT NULL,
 cold_verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(cold_verified_at>=captured_at)
);
CREATE FUNCTION turas_backup.capture_receipt_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM turas_backup.contract WHERE installation_id=NEW.installation_id)
  OR NOT EXISTS(SELECT 1 FROM turas_backup.archives WHERE id=NEW.archive_id
   AND environment_id=NEW.environment_id AND captured_at=NEW.captured_at
   AND expires_at>clock_timestamp()) THEN
  RAISE EXCEPTION 'Current exact archive receipt required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER capture_receipt_admission BEFORE INSERT ON turas_backup.capture_receipts
 FOR EACH ROW EXECUTE FUNCTION turas_backup.capture_receipt_admission();
CREATE TRIGGER capture_receipt_immutable BEFORE UPDATE OR DELETE ON turas_backup.capture_receipts
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
-- Full candidate metadata stays encrypted and expires with its managed archive.
-- Its minimal audit digest/key reference remain in capture_receipts.
CREATE TABLE turas_backup.capture_capsules (
 archive_id uuid PRIMARY KEY REFERENCES turas_backup.archives(id),
 ciphertext bytea NOT NULL CHECK(octet_length(ciphertext) BETWEEN 68 AND 1048576)
);
CREATE TRIGGER capture_capsule_immutable BEFORE UPDATE ON turas_backup.capture_capsules
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE TRIGGER capture_capsule_expiry BEFORE DELETE ON turas_backup.capture_capsules
 FOR EACH ROW EXECUTE FUNCTION turas_backup.expiry_fence();
REVOKE ALL ON turas_backup.capture_receipts FROM PUBLIC;
REVOKE ALL ON turas_backup.capture_capsules FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.capture_receipt_admission() FROM PUBLIC;
COMMIT;
