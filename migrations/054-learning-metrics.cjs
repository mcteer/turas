exports.up = pgm => pgm.sql(`
 CREATE FUNCTION turas_learning_provision_workspace() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  INSERT INTO public.learning_workspace_state(environment_id,workspace_id)
   SELECT environment_id,NEW.id FROM public.turas_environment ON CONFLICT DO NOTHING;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_learning_provision_workspace() FROM PUBLIC;
 CREATE TRIGGER learning_provision_workspace AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION turas_learning_provision_workspace();
 CREATE TABLE learning_measurement_contributions(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,
  metric_id text NOT NULL CHECK(metric_id IN('deployment_lead_time','change_failure_rate')),quarter text NOT NULL CHECK(quarter ~ '^20[0-9]{2}-Q[1-4]$'),
  author_membership_id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),head_revision_id uuid,
  state text NOT NULL DEFAULT 'proposed' CHECK(state IN('proposed','approved','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE INDEX learning_measurement_population ON learning_measurement_contributions(environment_id,workspace_id,metric_id,quarter,customer_id);
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_measurement_contributions FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,head_revision_id,state');
 CREATE TABLE learning_measurement_revisions(
  id uuid PRIMARY KEY,contribution_id uuid NOT NULL REFERENCES learning_measurement_contributions(id),revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
  protocol_version text NOT NULL CHECK(protocol_version IN('deployment-lead-time-v1','change-failure-rate-v1')),
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),
  author_membership_id uuid NOT NULL REFERENCES memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,contribution_id),UNIQUE(contribution_id,revision_number));
 ALTER TABLE learning_measurement_contributions ADD FOREIGN KEY(head_revision_id,id) REFERENCES learning_measurement_revisions(id,contribution_id);
 CREATE TABLE learning_measurement_payloads(revision_id uuid PRIMARY KEY REFERENCES learning_measurement_revisions(id),content json NOT NULL CHECK(octet_length(content::text)<=131072));
 CREATE TABLE learning_measurement_approvals(
  id uuid PRIMARY KEY,revision_id uuid NOT NULL UNIQUE REFERENCES learning_measurement_revisions(id),actor_membership_id uuid NOT NULL REFERENCES memberships(id),
  actor_generation bigint NOT NULL CHECK(actor_generation BETWEEN 1 AND 9007199254740991),decision text NOT NULL CHECK(decision IN('approve','reject')),
  closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),reuse_approved boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(reuse_approved=(decision='approve')));
 CREATE TABLE learning_measurement_review_payloads(review_id uuid PRIMARY KEY REFERENCES learning_measurement_approvals(id),content json NOT NULL CHECK(octet_length(content::text)<=16384));
 CREATE TABLE learning_cohort_families(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,metric_id text NOT NULL CHECK(metric_id IN('deployment_lead_time','change_failure_rate')),
  quarter text NOT NULL CHECK(quarter ~ '^20[0-9]{2}-Q[1-4]$'),version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  state text NOT NULL DEFAULT 'unreleased' CHECK(state IN('unreleased','released','withheld')),released_at timestamptz,withheld_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  UNIQUE(environment_id,workspace_id,metric_id,quarter),UNIQUE(id,environment_id,workspace_id));
 CREATE FUNCTION turas_learning_family_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF(OLD.state='withheld' AND NEW.state<>'withheld') OR(OLD.state='released' AND NEW.state='unreleased') OR
   (OLD.released_at IS NOT NULL AND NEW.released_at IS DISTINCT FROM OLD.released_at) THEN
   RAISE EXCEPTION 'Released cohort family cannot be replaced' USING ERRCODE='23514'; END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER learning_family_guard BEFORE UPDATE ON learning_cohort_families FOR EACH ROW EXECUTE FUNCTION turas_learning_family_guard();
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_cohort_families FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,state,released_at,withheld_at');
 CREATE TABLE learning_cohort_releases(
  id uuid PRIMARY KEY,family_id uuid NOT NULL UNIQUE REFERENCES learning_cohort_families(id),protocol_version text NOT NULL,
  formula_version text NOT NULL CHECK(formula_version='learning-metrics-v1'),manifest_digest text NOT NULL CHECK(manifest_digest ~ '^[a-f0-9]{64}$'),
  rounded_mean_change text NOT NULL CHECK(rounded_mean_change ~ '^-?[0-9]+[.][0-9]{2}$'),
  participant_count integer NOT NULL CHECK(participant_count BETWEEN 5 AND 10000),actor_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE learning_cohort_dependencies(
  release_id uuid NOT NULL REFERENCES learning_cohort_releases(id),measurement_revision_id uuid NOT NULL REFERENCES learning_measurement_revisions(id),
  approval_id uuid NOT NULL REFERENCES learning_measurement_approvals(id),customer_id uuid NOT NULL REFERENCES customer_references(id),
  closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),PRIMARY KEY(release_id,customer_id));
 CREATE TABLE learning_lifecycle_scans(
  environment_id text NOT NULL,workspace_id uuid NOT NULL,owner_kind text NOT NULL CHECK(owner_kind IN('review','draft','evaluation','measurement','cohort')),
  owner_id uuid NOT NULL,next_check_at timestamptz NOT NULL DEFAULT clock_timestamp(),checked_at timestamptz,
  PRIMARY KEY(environment_id,workspace_id,owner_kind,owner_id),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id));
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_lifecycle_scans FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('next_check_at,checked_at');
 CREATE TABLE learning_refresh_jobs(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,actor_membership_id uuid REFERENCES memberships(id),
  owner_kind text NOT NULL CHECK(owner_kind IN('publication','evaluation','measurement')),owner_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),completed_at timestamptz,
  deadline_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','running','completed','failed','cancelled','review_required')),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
  failure_code text,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),UNIQUE(environment_id,workspace_id,owner_kind,owner_id,deadline_at));
 CREATE TABLE learning_cleanup_jobs(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,owner_kind text NOT NULL,owner_id uuid NOT NULL,
  due_at timestamptz NOT NULL,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','running','completed','review_required')),
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),completed_at timestamptz,
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),UNIQUE(environment_id,workspace_id,owner_kind,owner_id));
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_refresh_jobs FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,state,next_attempt_at,attempts,completed_at,failure_code');
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('due_at,state,next_attempt_at,attempts,completed_at');
 CREATE FUNCTION turas_learning_cleanup_deadline() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.due_at>OLD.due_at THEN RAISE EXCEPTION 'Learning cleanup deadline cannot increase' USING ERRCODE='23514'; END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_cleanup_deadline BEFORE UPDATE ON learning_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION turas_learning_cleanup_deadline();
 CREATE TABLE learning_native_retirement_receipts(attempt_id uuid PRIMARY KEY REFERENCES learning_attempts(id),native_session_id text NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp());
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['learning_measurement_revisions','learning_measurement_payloads','learning_measurement_approvals','learning_measurement_review_payloads','learning_cohort_releases','learning_cohort_dependencies','learning_native_retirement_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER learning_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_learning_immutable()',t);END LOOP;END $$;
 CREATE FUNCTION turas_learning_purge(expected_environment text,batch_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE n integer:=0;affected integer:=0;BEGIN
  IF batch_limit<1 OR batch_limit>100 OR NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment) THEN RAISE EXCEPTION 'Invalid learning purge scope';END IF;
  PERFORM set_config('turas.learning_purge','on',true);
  DELETE FROM public.learning_feedback_payloads p WHERE p.revision_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_feedback_revisions r ON r.id=s.owner_id JOIN public.learning_feedback f ON f.id=r.feedback_id WHERE s.kind='feedback' AND f.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT batch_limit);GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_review_payloads p WHERE p.review_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_candidate_reviews r ON r.id=s.owner_id WHERE s.kind='review' AND r.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_attempt_payloads p WHERE p.ctid IN(SELECT p2.ctid FROM public.learning_attempt_payloads p2 JOIN public.learning_payload_states s ON s.owner_id=p2.attempt_id AND s.kind='attempt' JOIN public.learning_attempts a ON a.id=s.owner_id WHERE a.environment_id=expected_environment AND s.purge_at<=clock_timestamp() AND (a.native_session_id IS NULL OR EXISTS(SELECT 1 FROM public.learning_native_retirement_receipts n WHERE n.attempt_id=a.id AND n.native_session_id=a.native_session_id)) ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_evaluation_payloads p WHERE p.evaluation_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_evaluations e ON e.id=s.owner_id WHERE s.kind='evaluation' AND e.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_case_review_payloads p WHERE p.review_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_case_reviews r ON r.id=s.owner_id JOIN public.learning_evaluations e ON e.id=r.evaluation_id WHERE s.kind='case_review' AND e.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_measurement_payloads p WHERE p.revision_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_measurement_revisions r ON r.id=s.owner_id JOIN public.learning_measurement_contributions c ON c.id=r.contribution_id WHERE s.kind='measurement' AND c.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_measurement_review_payloads p WHERE p.review_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_measurement_approvals a ON a.id=s.owner_id JOIN public.learning_measurement_revisions r ON r.id=a.revision_id JOIN public.learning_measurement_contributions c ON c.id=r.contribution_id WHERE s.kind='measurement_review' AND c.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_disposition_payloads p WHERE p.disposition_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_feedback_dispositions d ON d.id=s.owner_id JOIN public.learning_feedback f ON f.id=d.feedback_id WHERE s.kind='disposition' AND f.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_settlement_payloads p WHERE p.settlement_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_budget_settlements t ON t.id=s.owner_id JOIN public.learning_budget_reservations r ON r.id=t.reservation_id JOIN public.learning_budget_accounts b ON b.id=r.budget_id WHERE s.kind='settlement' AND b.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_rollback_payloads p WHERE p.rollback_id IN(SELECT s.owner_id FROM public.learning_payload_states s JOIN public.learning_rollback_records r ON r.id=s.owner_id WHERE s.kind='rollback' AND r.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  UPDATE public.learning_rollback_records SET actor_membership_id=NULL,created_at=NULL,minimized=true WHERE id IN(SELECT r.id FROM public.learning_rollback_records r WHERE r.environment_id=expected_environment AND NOT r.minimized AND r.created_at<=clock_timestamp()-interval '365 days' AND NOT EXISTS(SELECT 1 FROM public.learning_rollback_payloads p WHERE p.rollback_id=r.id) ORDER BY r.created_at,r.id LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  DELETE FROM public.learning_review_payloads p WHERE p.review_id IN(SELECT r.id FROM public.learning_candidate_reviews r JOIN public.learning_review_states s ON s.review_id=r.id WHERE r.environment_id=expected_environment AND r.created_at<=clock_timestamp()-interval '365 days' AND s.revoked_at IS NOT NULL ORDER BY r.created_at,r.id LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  UPDATE public.learning_candidate_reviews SET reviewer_membership_id=NULL,reviewer_generation=NULL,created_at=NULL,minimized=true WHERE id IN(SELECT r.id FROM public.learning_candidate_reviews r JOIN public.learning_review_states s ON s.review_id=r.id WHERE r.environment_id=expected_environment AND NOT r.minimized AND r.created_at<=clock_timestamp()-interval '365 days' AND s.revoked_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.learning_review_payloads p WHERE p.review_id=r.id) ORDER BY r.created_at,r.id LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  UPDATE public.learning_command_receipts SET outcome='retired',target_id=NULL,version=NULL,created_at=NULL WHERE id IN(SELECT id FROM public.learning_command_receipts WHERE environment_id=expected_environment AND created_at<=clock_timestamp()-interval '365 days' ORDER BY created_at,id LIMIT GREATEST(0,batch_limit-affected));GET DIAGNOSTICS n=ROW_COUNT;affected:=affected+n;
  PERFORM set_config('turas.learning_purge','',true);RETURN affected;
 END $$;
 REVOKE ALL ON FUNCTION turas_learning_purge(text,integer) FROM PUBLIC;
`);
