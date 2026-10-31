-- Explicit owner migration in the independent work archive, never primary.
BEGIN;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='10s';
CREATE TABLE turas_backup.native_cancel_intents (
 project_id text NOT NULL CHECK(project_id ~ '^prj_[A-Za-z0-9]+$'),
 run_id text NOT NULL CHECK(run_id ~ '^wrun_[A-Za-z0-9_-]{1,240}$'),
 installation_id uuid NOT NULL,
 environment_id text NOT NULL CHECK(length(environment_id) BETWEEN 1 AND 256),
 recovery_id uuid NOT NULL,
 control_revision bigint NOT NULL CHECK(control_revision>0),
 team_id text NOT NULL CHECK(team_id ~ '^team_[A-Za-z0-9]+$'),
 deployment_id text NOT NULL CHECK(deployment_id ~ '^dpl_[A-Za-z0-9]+$'),
 workflow_name text NOT NULL CHECK(workflow_name IN('workflow//eve//workflowEntry','workflow//eve//sessionTimeoutWorkflow','workflow//eve//taskRunWorkflow','workflow//eve//turnWorkflow')),
 binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(project_id,run_id)
);
CREATE FUNCTION turas_backup.native_cancel_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(160007);
 IF NOT EXISTS(SELECT 1 FROM turas_backup.contract WHERE installation_id=NEW.installation_id)
  OR (SELECT count(*) FROM turas_backup.native_cancel_intents)>=10000
  OR pg_database_size(current_database())>=419430400 THEN
  RAISE EXCEPTION 'Exact bounded independent cancellation journal required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_cancel_admission BEFORE INSERT ON turas_backup.native_cancel_intents
 FOR EACH ROW EXECUTE FUNCTION turas_backup.native_cancel_admission();
CREATE TRIGGER native_cancel_immutable BEFORE UPDATE OR DELETE ON turas_backup.native_cancel_intents
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
CREATE TABLE turas_backup.native_closure_observations (
 id uuid PRIMARY KEY,
 installation_id uuid NOT NULL,
 project_id text NOT NULL CHECK(project_id ~ '^prj_[A-Za-z0-9]+$'),
 run_id text NOT NULL CHECK(run_id ~ '^wrun_[A-Za-z0-9_-]{1,240}$'),
 environment_id text NOT NULL CHECK(length(environment_id) BETWEEN 1 AND 256),
 recovery_id uuid NOT NULL,
 control_revision bigint NOT NULL CHECK(control_revision>0),
 binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
 provider_state text NOT NULL CHECK(provider_state IN('completed','failed','cancelled')),
 source_commit text NOT NULL CHECK(source_commit ~ '^[a-f0-9]{40}$'),
 provider_proof_digest text NOT NULL CHECK(provider_proof_digest ~ '^[a-f0-9]{64}$'),
 observed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(installation_id,project_id,run_id,recovery_id,control_revision,source_commit)
);
CREATE FUNCTION turas_backup.native_closure_admission() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(160007);
 IF NOT EXISTS(SELECT 1 FROM turas_backup.contract WHERE installation_id=NEW.installation_id)
  OR (SELECT count(*) FROM turas_backup.native_closure_observations)>=10000
  OR pg_database_size(current_database())>=419430400 THEN
  RAISE EXCEPTION 'Exact bounded independent closure journal required' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER native_closure_admission BEFORE INSERT ON turas_backup.native_closure_observations
 FOR EACH ROW EXECUTE FUNCTION turas_backup.native_closure_admission();
CREATE TRIGGER native_closure_immutable BEFORE UPDATE OR DELETE ON turas_backup.native_closure_observations
 FOR EACH ROW EXECUTE FUNCTION turas_backup.immutable();
REVOKE ALL ON turas_backup.native_closure_observations FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.native_closure_admission() FROM PUBLIC;
REVOKE ALL ON turas_backup.native_cancel_intents FROM PUBLIC;
REVOKE ALL ON FUNCTION turas_backup.native_cancel_admission() FROM PUBLIC;
COMMIT;
