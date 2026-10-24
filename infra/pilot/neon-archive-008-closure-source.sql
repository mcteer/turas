-- Explicit independent owner migration. No unverifiable provenance backfill.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM turas_backup.native_closure_observations) THEN
  RAISE EXCEPTION 'Existing closure provenance requires explicit reconciliation';
 END IF;
END $$;
ALTER TABLE turas_backup.native_closure_observations
 ADD COLUMN source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN catalog_digest text NOT NULL CHECK(catalog_digest ~ '^[a-f0-9]{64}$');
COMMIT;
