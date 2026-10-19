exports.up = (pgm) => pgm.sql(`
 CREATE TABLE operations_control(
  environment_id text PRIMARY KEY REFERENCES turas_environment(environment_id),
  mode text NOT NULL CHECK(mode IN('open','quiescing','locked')),
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>=1),recovery_id uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  owner_operation_digest text NOT NULL CHECK(owner_operation_digest ~ '^[a-f0-9]{64}$'),
  verified_bundle_digest text CHECK(verified_bundle_digest ~ '^[a-f0-9]{64}$'));
 INSERT INTO operations_control(environment_id,mode,owner_operation_digest)
  SELECT environment_id,'open',repeat('0',64) FROM turas_environment;
 CREATE FUNCTION turas_control_write_fence() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN
   RAISE EXCEPTION 'Recovery control requires owner authority' USING ERRCODE='42501'; END IF;
  IF NEW.environment_id IS DISTINCT FROM OLD.environment_id THEN RAISE EXCEPTION 'Control identity is immutable'; END IF;
  IF OLD.mode='locked' OR NEW.mode='locked' THEN PERFORM pg_advisory_xact_lock(hashtextextended(OLD.environment_id,16017)); END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER operations_control_write_fence BEFORE UPDATE ON operations_control FOR EACH ROW EXECUTE FUNCTION turas_control_write_fence();
 CREATE FUNCTION turas_session_recovery_admission() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE marker text; admission text;
 BEGIN
  IF current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN RETURN NEW; END IF;
  SELECT environment_id INTO STRICT marker FROM turas_environment;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(marker,16017));
  SELECT mode INTO admission FROM operations_control WHERE environment_id=marker;
  IF admission IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'Session admission closed' USING ERRCODE='55000'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER login_session_recovery_admission BEFORE INSERT ON login_sessions
  FOR EACH ROW EXECUTE FUNCTION turas_session_recovery_admission();
 CREATE TABLE operations_control_transitions(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES operations_control(environment_id),
  from_mode text NOT NULL CHECK(from_mode IN('open','quiescing','locked')),
  to_mode text NOT NULL CHECK(to_mode IN('open','quiescing','locked')),
  revision bigint NOT NULL CHECK(revision>=2),recovery_id uuid,
  operation_digest text NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
  bundle_digest text CHECK(bundle_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(environment_id,revision));
 -- Owner-issued maintenance reads never reopen ordinary admission. Only a
 -- secret hash is retained, with exact session/record/release/scope and limits.
 CREATE TABLE operations_recovery_http_reads(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES operations_control(environment_id),
  recovery_id uuid NOT NULL,control_revision bigint NOT NULL CHECK(control_revision>0),
  session_id uuid NOT NULL REFERENCES login_sessions(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  customer_id uuid NOT NULL REFERENCES customer_references(id),
  read_kind text NOT NULL DEFAULT 'profile' CHECK(read_kind IN('profile','artifact')),
  record_id uuid,record_digest text,record_size integer,record_generation bigint,
  CHECK((read_kind='profile' AND record_id IS NULL AND record_digest IS NULL AND record_size IS NULL AND record_generation IS NULL) OR
   (read_kind='artifact' AND record_id IS NOT NULL AND record_digest ~ '^[a-f0-9]{64}$' AND record_size BETWEEN 1 AND 10485760 AND record_generation>0 AND record_digest IS NOT NULL AND record_size IS NOT NULL AND record_generation IS NOT NULL)),
  source_commit text NOT NULL CHECK(source_commit ~ '^[a-f0-9]{40}$'),
  origin text NOT NULL,deployment_id text,
  secret_hash text NOT NULL CHECK(secret_hash ~ '^[a-f0-9]{64}$'),
  database_binding_digest text NOT NULL CHECK(database_binding_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  revoked_at timestamptz,maximum_requests integer NOT NULL CHECK(maximum_requests BETWEEN 1 AND 10),
  used_requests integer NOT NULL DEFAULT 0 CHECK(used_requests>=0 AND used_requests<=maximum_requests),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '60 seconds'));
 CREATE FUNCTION turas_recovery_http_read_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN
   IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Recovery read requires owner' USING ERRCODE='42501'; END IF;
   IF (to_jsonb(NEW)-'used_requests') IS DISTINCT FROM (to_jsonb(OLD)-'used_requests') OR NEW.used_requests<>OLD.used_requests+1 THEN
    RAISE EXCEPTION 'Recovery read permits only bounded reservation' USING ERRCODE='42501'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.environment_id,16017));
  IF TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=NEW.environment_id AND mode='locked' AND revision=NEW.control_revision AND recovery_id=NEW.recovery_id) THEN
   RAISE EXCEPTION 'Exact locked recovery read scope required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER recovery_http_read_guard BEFORE INSERT OR UPDATE OR DELETE ON operations_recovery_http_reads FOR EACH ROW EXECUTE FUNCTION turas_recovery_http_read_guard();
 CREATE TABLE operations_recovery_verifications(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES operations_control(environment_id),
  recovery_id uuid NOT NULL,control_revision bigint NOT NULL CHECK(control_revision>=1),
  bundle_digest text NOT NULL CHECK(bundle_digest ~ '^[a-f0-9]{64}$'),
  ledger_digest text NOT NULL CHECK(ledger_digest ~ '^[a-f0-9]{64}$'),
  objects_digest text NOT NULL CHECK(objects_digest ~ '^[a-f0-9]{64}$'),
  current_state_digest text NOT NULL CHECK(current_state_digest ~ '^[a-f0-9]{64}$'),
  denial_digest text NOT NULL CHECK(denial_digest ~ '^[a-f0-9]{64}$'),
  replay_digest text NOT NULL CHECK(replay_digest ~ '^[a-f0-9]{64}$'),
  workflow_digest text NOT NULL CHECK(workflow_digest ~ '^[a-f0-9]{64}$'),
  scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
  required_scope_healthy boolean NOT NULL,integrity_verified boolean NOT NULL,
  denial_verified boolean NOT NULL,replay_verified boolean NOT NULL,workflow_verified boolean NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(environment_id,recovery_id,control_revision,bundle_digest));
 CREATE FUNCTION turas_pilot_immutable_recovery_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Recovery receipt is immutable' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER recovery_transition_immutable BEFORE UPDATE OR DELETE ON operations_control_transitions FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE TRIGGER recovery_verification_immutable BEFORE UPDATE OR DELETE ON operations_recovery_verifications FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE TABLE operations_recovery_quarantines(
  environment_id text NOT NULL REFERENCES operations_control(environment_id),recovery_id uuid NOT NULL,
  control_revision bigint NOT NULL CHECK(control_revision>=1),
  scope_kind text NOT NULL CHECK(scope_kind IN('sessions','mcp','grants','sources','publications','external-effects','workflow')),
  reason text NOT NULL CHECK(reason='current_proof_unavailable'),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,recovery_id,scope_kind));
 CREATE FUNCTION turas_recovery_quarantine_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN
   RAISE EXCEPTION 'Recovery quarantine requires owner authority' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16020));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16017));
  IF NOT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=NEW.environment_id AND mode='locked'
   AND recovery_id=NEW.recovery_id AND revision=NEW.control_revision) THEN
   RAISE EXCEPTION 'Exact locked quarantine required' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME IN('operations_recovery_model_holds','operations_recovery_model_observations') THEN
   IF NEW.source_captured_at>clock_timestamp() OR NEW.source_captured_at<clock_timestamp()-interval '5 minutes' THEN
   RAISE EXCEPTION 'Fresh model hold source required' USING ERRCODE='23514'; END IF;
  END IF;
  NEW.recorded_at:=clock_timestamp();RETURN NEW;
 END $$;
 CREATE TRIGGER recovery_quarantine_admission BEFORE INSERT ON operations_recovery_quarantines FOR EACH ROW EXECUTE FUNCTION turas_recovery_quarantine_admission();
 CREATE TRIGGER recovery_quarantine_immutable BEFORE UPDATE OR DELETE ON operations_recovery_quarantines FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 -- A restored missing dispatch record is not proof of no charge. Preserve the
 -- reservation until an explicit existing settlement supplies accounting.
 CREATE TABLE operations_recovery_paid_holds(
  reservation_id uuid PRIMARY KEY REFERENCES learning_budget_reservations(id),
  environment_id text NOT NULL REFERENCES operations_control(environment_id),
  recovery_id uuid NOT NULL,control_revision bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TRIGGER recovery_paid_hold_immutable BEFORE UPDATE OR DELETE ON operations_recovery_paid_holds
  FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE FUNCTION turas_recovery_paid_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM operations_recovery_paid_holds WHERE reservation_id=NEW.reservation_id) THEN
   RAISE EXCEPTION 'Restored paid reservation requires explicit accounting' USING ERRCODE='23514';
  END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER recovery_paid_release_guard BEFORE INSERT ON learning_reservation_releases
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_paid_release_guard();
 -- Typed recovery holds also represent operations absent from an older backup.
 -- Their scope remains retired; settlement never silently refunds that scope.
 CREATE TABLE operations_recovery_model_holds(
  environment_id text NOT NULL REFERENCES operations_control(environment_id),
  operation_kind text NOT NULL CHECK(operation_kind IN('ordinary_tokens','parity_dollars')),
  operation_id uuid NOT NULL,scope_id uuid NOT NULL,
  ceiling_tokens integer CHECK(ceiling_tokens BETWEEN 1 AND 20000),ceiling_micro_usd bigint CHECK(ceiling_micro_usd>=0),
  actual_tokens integer CHECK(actual_tokens>=0),actual_micro_usd bigint CHECK(actual_micro_usd>=0),settled_at timestamptz,
  baseline_output_tokens integer CHECK(baseline_output_tokens>=0),
  evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[a-f0-9]{64}$'),
  evidence_digest_kind text NOT NULL CHECK(evidence_digest_kind IN('operation_row','snapshot')),
  source_captured_at timestamptz NOT NULL,recovery_id uuid NOT NULL,control_revision bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,operation_kind,operation_id),
  CHECK((operation_kind='ordinary_tokens' AND baseline_output_tokens IS NOT NULL AND ceiling_tokens IS NOT NULL AND ceiling_micro_usd IS NULL AND actual_micro_usd IS NULL AND ((actual_tokens IS NULL)=(settled_at IS NULL)))
    OR (operation_kind='parity_dollars' AND baseline_output_tokens IS NULL AND ceiling_micro_usd IS NOT NULL AND ceiling_tokens IS NULL AND actual_tokens IS NULL AND ((actual_micro_usd IS NULL)=(settled_at IS NULL)))));
 CREATE TRIGGER recovery_model_hold_immutable BEFORE UPDATE OR DELETE ON operations_recovery_model_holds
  FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE TRIGGER recovery_model_hold_admission BEFORE INSERT ON operations_recovery_model_holds
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_quarantine_admission();
 CREATE TABLE operations_recovery_model_observations(
  environment_id text NOT NULL,operation_kind text NOT NULL,operation_id uuid NOT NULL,
  observed_evidence_digest text NOT NULL CHECK(observed_evidence_digest ~ '^[a-f0-9]{64}$'),
  observed_captured_at timestamptz NOT NULL,observed_digest_kind text NOT NULL CHECK(observed_digest_kind IN('operation_row','snapshot')),evidence_kind text NOT NULL CHECK(evidence_kind IN('operation','inherited_hold')),
  ceiling_tokens integer CHECK(ceiling_tokens BETWEEN 1 AND 20000),ceiling_micro_usd bigint CHECK(ceiling_micro_usd>=0),
  actual_tokens integer CHECK(actual_tokens>=0),actual_micro_usd bigint CHECK(actual_micro_usd>=0),settled_at timestamptz,
  snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^[a-f0-9]{64}$'),source_captured_at timestamptz NOT NULL,
  recovery_id uuid NOT NULL,control_revision bigint NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,operation_kind,operation_id,observed_evidence_digest,evidence_kind),
  FOREIGN KEY(environment_id,operation_kind,operation_id) REFERENCES operations_recovery_model_holds(environment_id,operation_kind,operation_id),
  CHECK((operation_kind='ordinary_tokens' AND ceiling_tokens IS NOT NULL AND ceiling_micro_usd IS NULL AND actual_micro_usd IS NULL AND ((actual_tokens IS NULL)=(settled_at IS NULL)))
   OR (operation_kind='parity_dollars' AND ceiling_micro_usd IS NOT NULL AND ceiling_tokens IS NULL AND actual_tokens IS NULL AND ((actual_micro_usd IS NULL)=(settled_at IS NULL)))));
 CREATE TRIGGER recovery_model_observation_immutable BEFORE UPDATE OR DELETE ON operations_recovery_model_observations
  FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE TRIGGER recovery_model_observation_admission BEFORE INSERT ON operations_recovery_model_observations
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_quarantine_admission();
 -- Count every original operation once. An interrupted operation retains its
 -- complete ceiling even if an older restored database lacks its original row.
 CREATE FUNCTION turas_ordinary_output_used(conversation uuid) RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT a.baseline_output_tokens::bigint+COALESCE((SELECT sum(usage.tokens) FROM (
   SELECT COALESCE(o.actual_tokens,o.ceiling_tokens)::bigint AS tokens FROM public.ordinary_model_operations o
    WHERE o.conversation_id=conversation AND NOT EXISTS(SELECT 1 FROM public.operations_recovery_model_holds h WHERE h.operation_kind='ordinary_tokens' AND h.operation_id=o.id AND h.scope_id=o.conversation_id)
   UNION ALL SELECT COALESCE(h.actual_tokens,h.ceiling_tokens)::bigint FROM public.operations_recovery_model_holds h
    WHERE h.operation_kind='ordinary_tokens' AND h.scope_id=conversation
  ) usage),0) FROM public.ordinary_conversation_allowances a WHERE a.conversation_id=conversation
 $$;
 REVOKE ALL ON FUNCTION turas_ordinary_output_used(uuid) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION turas_ordinary_output_used(uuid) TO turas_runtime;
 CREATE FUNCTION turas_recovery_model_admission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE environment text; scope uuid; kind text; used bigint; baseline integer;
 BEGIN
  SELECT environment_id INTO STRICT environment FROM public.turas_environment;
  IF TG_TABLE_NAME='ordinary_model_operations' THEN scope:=NEW.conversation_id;kind:='ordinary_tokens';
  ELSE scope:=NEW.budget_id;kind:='parity_dollars'; END IF;
  IF EXISTS(SELECT 1 FROM public.operations_recovery_model_holds WHERE environment_id=environment AND operation_kind=kind AND scope_id=scope) THEN
   IF kind='parity_dollars' THEN RAISE EXCEPTION 'Recovered model scope requires explicit accounting' USING ERRCODE='23514'; END IF;
   PERFORM 1 FROM public.conversations WHERE id=scope FOR UPDATE;
   SELECT baseline_output_tokens INTO baseline FROM public.ordinary_conversation_allowances WHERE conversation_id=scope;
   IF baseline IS NULL OR EXISTS(SELECT 1 FROM public.operations_recovery_model_holds WHERE operation_kind='ordinary_tokens' AND scope_id=scope AND baseline_output_tokens<>baseline)
    OR NEW.actual_tokens IS NOT NULL OR NEW.settled_at IS NOT NULL THEN RAISE EXCEPTION 'Recovered conversation allowance differs' USING ERRCODE='23514'; END IF;
   SELECT public.turas_ordinary_output_used(scope) INTO used;
   IF used IS NULL OR used+NEW.ceiling_tokens>20000 THEN RAISE EXCEPTION 'Recovered conversation output allowance exhausted' USING ERRCODE='23514'; END IF;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.operations_control WHERE environment_id=environment AND mode='open') THEN
   RAISE EXCEPTION 'Model admission closed for recovery' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_recovery_model_admission() FROM PUBLIC;
 CREATE TRIGGER recovery_ordinary_model_admission BEFORE INSERT ON ordinary_model_operations
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_model_admission();
 CREATE TRIGGER recovery_parity_model_admission BEFORE INSERT ON parity_evaluation_operations
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_model_admission();
 CREATE FUNCTION turas_recovery_parity_budget_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 BEGIN
  IF EXISTS(SELECT 1 FROM public.operations_recovery_model_holds WHERE operation_kind='parity_dollars' AND scope_id=OLD.id)
   AND (NEW.reserved_micro_usd<OLD.reserved_micro_usd OR (OLD.state<>'open' AND NEW.state='open')) THEN
   RAISE EXCEPTION 'Recovered budget cannot be refunded or reopened' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_recovery_parity_budget_guard() FROM PUBLIC;
 CREATE TRIGGER recovery_parity_budget_guard BEFORE UPDATE ON parity_evaluation_budgets
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_parity_budget_guard();
 CREATE FUNCTION turas_recovery_model_settlement_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE scope uuid; kind text;
 BEGIN
  IF TG_TABLE_NAME='ordinary_model_operations' THEN scope:=OLD.conversation_id;kind:='ordinary_tokens';
  ELSE scope:=OLD.budget_id;kind:='parity_dollars'; END IF;
  IF session_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.operations_control'::regclass))
   AND EXISTS(SELECT 1 FROM public.operations_recovery_model_holds WHERE operation_kind=kind AND scope_id=scope AND (operation_id=OLD.id OR kind='parity_dollars')) THEN
   RAISE EXCEPTION 'Recovered model settlement requires owner accounting' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_recovery_model_settlement_guard() FROM PUBLIC;
 CREATE TRIGGER recovery_ordinary_settlement_guard BEFORE UPDATE ON ordinary_model_operations
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_model_settlement_guard();
 CREATE TRIGGER recovery_parity_settlement_guard BEFORE UPDATE ON parity_evaluation_operations
  FOR EACH ROW EXECUTE FUNCTION turas_recovery_model_settlement_guard();
 CREATE TABLE operations_recovery_quarantine_resolutions(
  environment_id text NOT NULL,recovery_id uuid NOT NULL,scope_kind text NOT NULL,
  verification_id uuid NOT NULL REFERENCES operations_recovery_verifications(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,recovery_id,scope_kind,verification_id),
  FOREIGN KEY(environment_id,recovery_id,scope_kind) REFERENCES operations_recovery_quarantines(environment_id,recovery_id,scope_kind));
 CREATE FUNCTION turas_recovery_resolution_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN
   RAISE EXCEPTION 'Recovery resolution requires owner authority' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16020));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16017));
  IF NOT EXISTS(SELECT 1 FROM operations_control c JOIN operations_recovery_verifications v
   ON v.environment_id=c.environment_id AND v.recovery_id=c.recovery_id AND v.control_revision=c.revision
   WHERE c.environment_id=NEW.environment_id AND c.mode='locked' AND v.id=NEW.verification_id
   AND v.verified_at>clock_timestamp()-interval '30 minutes' AND v.verified_at<=clock_timestamp()
   AND v.required_scope_healthy AND v.integrity_verified AND v.denial_verified AND v.replay_verified AND v.workflow_verified) THEN
   RAISE EXCEPTION 'Fresh complete recovery verification required' USING ERRCODE='23514'; END IF;
  NEW.recorded_at:=clock_timestamp();RETURN NEW;
 END $$;
 CREATE TRIGGER recovery_resolution_admission BEFORE INSERT ON operations_recovery_quarantine_resolutions FOR EACH ROW EXECUTE FUNCTION turas_recovery_resolution_admission();
 CREATE TRIGGER recovery_resolution_immutable BEFORE UPDATE OR DELETE ON operations_recovery_quarantine_resolutions FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 -- Keep the original quarantine forever. Only resolutions tied to the current
 -- exact, fresh complete owner verification can satisfy the unlock fence.
 CREATE FUNCTION turas_recovery_quarantine_unlock_fence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.mode='open' AND OLD.mode<>'open' AND EXISTS(SELECT 1 FROM operations_recovery_quarantines q WHERE q.environment_id=OLD.environment_id
   AND NOT EXISTS(SELECT 1 FROM operations_recovery_quarantine_resolutions r JOIN operations_recovery_verifications v ON v.id=r.verification_id
    WHERE r.environment_id=q.environment_id AND r.recovery_id=q.recovery_id AND r.scope_kind=q.scope_kind
    AND v.environment_id=OLD.environment_id AND v.recovery_id=OLD.recovery_id AND v.control_revision=OLD.revision
    AND v.bundle_digest=NEW.verified_bundle_digest AND v.verified_at>clock_timestamp()-interval '30 minutes' AND v.verified_at<=clock_timestamp()
    AND v.required_scope_healthy AND v.integrity_verified AND v.denial_verified AND v.replay_verified AND v.workflow_verified)) THEN
   RAISE EXCEPTION 'Required recovery scopes remain quarantined' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER operations_recovery_quarantine_unlock BEFORE UPDATE ON operations_control FOR EACH ROW EXECUTE FUNCTION turas_recovery_quarantine_unlock_fence();
 ALTER TABLE knowledge_publications ADD COLUMN last_maintenance_checked_at timestamptz;
 CREATE INDEX knowledge_maintenance_due ON knowledge_publications(environment_id,last_maintenance_checked_at,published_at) WHERE state='published';
 CREATE TABLE operations_maintenance_status(
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  class_id text NOT NULL CHECK(class_id IN('conversation','artifacts','workforce','retrieval','research-freshness','knowledge','plans','execution','support','expansion','reports','gaps','partners','learning','mcp')),
  generation bigint NOT NULL DEFAULT 1 CHECK(generation>=1),lease_id uuid,lease_expires_at timestamptz,
  last_started_at timestamptz,last_completed_at timestamptz,last_success_at timestamptz,
  safe_failure text CHECK(safe_failure IN('unavailable','deadline','lost_lease','invalid_result','source_changed','provider_unknown')),
  backlog_count integer NOT NULL DEFAULT 0 CHECK(backlog_count BETWEEN 0 AND 1000),
  oldest_due_at timestamptz,backlog_truncated boolean NOT NULL DEFAULT false,duration_ms integer CHECK(duration_ms BETWEEN 0 AND 360000),
  code_version text CHECK(code_version ~ '^[a-f0-9]{40}$'),PRIMARY KEY(environment_id,class_id),
  CHECK((lease_id IS NULL)=(lease_expires_at IS NULL)));
 CREATE TABLE operations_health_samples(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  kind text NOT NULL CHECK(kind IN('readiness','maintenance','fault')),
  state text NOT NULL CHECK(state IN('pass','fail','blocked','unverified')),
  class_id text CHECK(class_id IN('conversation','artifacts','workforce','retrieval','research-freshness','knowledge','plans','execution','support','expansion','reports','gaps','partners','learning','mcp')),
  duration_ms integer CHECK(duration_ms BETWEEN 0 AND 360000),backlog_count integer CHECK(backlog_count BETWEEN 0 AND 1000),oldest_due_at timestamptz,
  code_version text NOT NULL CHECK(code_version ~ '^[a-f0-9]{40}$'),
  sampled_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  CHECK((kind='maintenance')=(class_id IS NOT NULL)),CHECK(expires_at=sampled_at+interval '2160 hours'));
 CREATE INDEX operations_health_samples_expiry ON operations_health_samples(environment_id,expires_at,id);
 CREATE FUNCTION turas_health_sample_expiry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  NEW.expires_at:=NEW.sampled_at+interval '2160 hours';RETURN NEW;
 END $$;
 CREATE TRIGGER operations_health_sample_expiry BEFORE INSERT ON operations_health_samples FOR EACH ROW EXECUTE FUNCTION turas_health_sample_expiry();
 CREATE FUNCTION turas_health_sample_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' AND OLD.expires_at<=clock_timestamp() THEN RETURN OLD;END IF;
  RAISE EXCEPTION 'Operational sample is immutable before expiry' USING ERRCODE='23514';
 END $$;
 CREATE TRIGGER operations_health_sample_immutable BEFORE UPDATE OR DELETE ON operations_health_samples FOR EACH ROW EXECUTE FUNCTION turas_health_sample_immutable();
 CREATE FUNCTION turas_expire_health_samples(expected_environment text,batch_limit integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE removed integer;BEGIN
  IF batch_limit IS NULL OR batch_limit<1 OR batch_limit>100 OR NOT EXISTS(SELECT 1 FROM turas_environment WHERE environment_id=expected_environment) THEN RAISE EXCEPTION 'Invalid operational expiry scope';END IF;
  DELETE FROM operations_health_samples WHERE id IN(SELECT id FROM operations_health_samples WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
 END $$;
 REVOKE ALL ON FUNCTION turas_expire_health_samples(text,integer) FROM PUBLIC;
 CREATE TABLE operations_store_observations(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  namespace text NOT NULL CHECK(namespace IN('artifact','artifact-staging','workforce','workforce-staging','report','gap-report')),
  store_binding_digest text NOT NULL CHECK(store_binding_digest ~ '^[a-f0-9]{64}$'),
  code_version text NOT NULL CHECK(code_version ~ '^[a-f0-9]{40}$'),
  proof_digest text NOT NULL CHECK(proof_digest ~ '^[a-f0-9]{64}$'),
  sampled_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL);
 CREATE INDEX store_observation_current ON operations_store_observations(environment_id,store_binding_digest,code_version,namespace,sampled_at DESC);
 CREATE TRIGGER store_observation_expiry BEFORE INSERT ON operations_store_observations FOR EACH ROW EXECUTE FUNCTION turas_health_sample_expiry();
 CREATE TRIGGER store_observation_immutable BEFORE UPDATE OR DELETE ON operations_store_observations FOR EACH ROW EXECUTE FUNCTION turas_health_sample_immutable();
 CREATE FUNCTION turas_expire_store_observations(expected_environment text,batch_limit integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE removed integer;BEGIN
  IF batch_limit IS NULL OR batch_limit<1 OR batch_limit>100 OR NOT EXISTS(SELECT 1 FROM turas_environment WHERE environment_id=expected_environment) THEN RAISE EXCEPTION 'Invalid operational expiry scope';END IF;
  DELETE FROM operations_store_observations WHERE id IN(SELECT id FROM operations_store_observations WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
 END $$;
 REVOKE ALL ON FUNCTION turas_expire_store_observations(text,integer) FROM PUBLIC;
 CREATE TABLE operations_backup_observations(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  store_binding_digest text NOT NULL CHECK(store_binding_digest ~ '^[a-f0-9]{64}$'),
  code_version text NOT NULL CHECK(code_version ~ '^[a-f0-9]{40}$'),
  proof_digest text NOT NULL CHECK(proof_digest ~ '^[a-f0-9]{64}$'),
  captured_at timestamptz NOT NULL,sampled_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  CHECK(captured_at<=sampled_at AND captured_at>sampled_at-interval '24 hours'));
 CREATE INDEX backup_observation_current ON operations_backup_observations(environment_id,store_binding_digest,code_version,sampled_at DESC);
 CREATE TRIGGER backup_observation_expiry BEFORE INSERT ON operations_backup_observations FOR EACH ROW EXECUTE FUNCTION turas_health_sample_expiry();
 CREATE TRIGGER backup_observation_immutable BEFORE UPDATE OR DELETE ON operations_backup_observations FOR EACH ROW EXECUTE FUNCTION turas_health_sample_immutable();
 CREATE FUNCTION turas_expire_backup_observations(expected_environment text,batch_limit integer) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE removed integer;BEGIN
  IF batch_limit IS NULL OR batch_limit<1 OR batch_limit>100 OR NOT EXISTS(SELECT 1 FROM turas_environment WHERE environment_id=expected_environment) THEN RAISE EXCEPTION 'Invalid operational expiry scope';END IF;
  DELETE FROM operations_backup_observations WHERE id IN(SELECT id FROM operations_backup_observations WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  GET DIAGNOSTICS removed=ROW_COUNT;RETURN removed;
 END $$;
 REVOKE ALL ON FUNCTION turas_expire_backup_observations(text,integer) FROM PUBLIC;
 CREATE TABLE operations_hosted_jobs(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  domain_kind text NOT NULL CHECK(domain_kind IN('artifact','workforce','report','gap-report')),
  domain_job_id uuid NOT NULL,source_generation bigint NOT NULL CHECK(source_generation>=1),
  code_version text NOT NULL CHECK(code_version ~ '^[a-f0-9]{40}$'),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  lease_id uuid NOT NULL,lease_expires_at timestamptz NOT NULL,
  provider_id text CHECK(length(provider_id) BETWEEN 1 AND 256),
  creation_tag uuid NOT NULL UNIQUE,image_digest text NOT NULL CHECK(image_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN('admitted','starting','running','reconciling','succeeded','failed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),started_at timestamptz,
  deadline_at timestamptz NOT NULL,finished_at timestamptz,
  input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),input_bytes bigint NOT NULL CHECK(input_bytes BETWEEN 0 AND 10485760),
  output_digest text CHECK(output_digest ~ '^[a-f0-9]{64}$'),output_bytes bigint CHECK(output_bytes BETWEEN 0 AND 52428800),
  budget_reservation_id uuid NOT NULL,
  safe_failure text CHECK(safe_failure IN('unavailable','deadline','lost_lease','invalid_result','source_changed','provider_unknown')),
  CHECK(deadline_at>created_at AND deadline_at<=created_at+interval '300 seconds'),
  CHECK(lease_expires_at>created_at AND lease_expires_at<=deadline_at),
  CHECK(state NOT IN('running','succeeded') OR provider_id IS NOT NULL),
  CHECK((output_digest IS NULL)=(output_bytes IS NULL)),
  CHECK((state IN('succeeded','failed','cancelled'))=(finished_at IS NOT NULL)));
 CREATE UNIQUE INDEX hosted_job_active_claim ON operations_hosted_jobs(environment_id,domain_kind,domain_job_id)
  WHERE state IN('admitted','starting','running','reconciling');
 CREATE INDEX hosted_job_due ON operations_hosted_jobs(environment_id,deadline_at)
  WHERE state IN('admitted','starting','running','reconciling');
 CREATE TABLE operations_local_jobs(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  domain_kind text NOT NULL CHECK(domain_kind IN('artifact','workforce','report','gap-report')),domain_job_id uuid NOT NULL,
  source_generation bigint NOT NULL CHECK(source_generation>=1),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  image_digest text NOT NULL CHECK(image_digest ~ '^[a-f0-9]{64}$'),lease_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,lease_expires_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN('running','reconciling','succeeded','failed','cancelled')),finished_at timestamptz,
  CHECK(deadline_at>created_at AND deadline_at<=created_at+interval '300 seconds'),
  CHECK(lease_expires_at>created_at AND lease_expires_at<=deadline_at),
  CHECK((state IN('succeeded','failed','cancelled'))=(finished_at IS NOT NULL)));
 CREATE UNIQUE INDEX local_job_active_claim ON operations_local_jobs(environment_id,domain_kind,domain_job_id)
  WHERE state IN('running','reconciling');
 CREATE FUNCTION turas_local_job_fence() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='INSERT' THEN
   PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.environment_id,16017));
   PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16016));
   IF NEW.state<>'running' OR NOT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=NEW.environment_id AND mode='open') THEN RAISE EXCEPTION 'Local execution admission closed'; END IF;
   IF (SELECT count(*) FROM operations_local_jobs WHERE environment_id=NEW.environment_id AND state IN('running','reconciling'))+
      (SELECT count(*) FROM operations_hosted_jobs WHERE environment_id=NEW.environment_id AND state IN('admitted','starting','running','reconciling'))>=2 THEN RAISE EXCEPTION 'Heavy job capacity exhausted'; END IF;
  ELSE
   IF (to_jsonb(NEW)-ARRAY['state','lease_expires_at','finished_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['state','lease_expires_at','finished_at'])
    OR OLD.state IN('succeeded','failed','cancelled') OR NEW.lease_expires_at>NEW.deadline_at
    OR NEW.state<>OLD.state AND NOT(OLD.state='running' AND NEW.state IN('reconciling','succeeded','failed') OR OLD.state='reconciling' AND NEW.state='cancelled') THEN RAISE EXCEPTION 'Local execution identity is immutable'; END IF;
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER local_job_fence BEFORE INSERT OR UPDATE ON operations_local_jobs FOR EACH ROW EXECUTE FUNCTION turas_local_job_fence();
 CREATE FUNCTION turas_hosted_job_admission() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.environment_id,16017));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16016));
  IF NOT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=NEW.environment_id AND mode='open') THEN
   RAISE EXCEPTION 'Operational admission is closed';
  END IF;
  IF (SELECT count(*) FROM operations_hosted_jobs WHERE environment_id=NEW.environment_id
      AND state IN('admitted','starting','running','reconciling'))+
     (SELECT count(*) FROM operations_local_jobs WHERE environment_id=NEW.environment_id AND state IN('running','reconciling'))>=2 THEN
   RAISE EXCEPTION 'Hosted job capacity exhausted';
  END IF;
  IF NEW.state<>'admitted' OR NEW.provider_id IS NOT NULL THEN RAISE EXCEPTION 'Invalid initial job'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER hosted_job_admission BEFORE INSERT ON operations_hosted_jobs FOR EACH ROW EXECUTE FUNCTION turas_hosted_job_admission();
 CREATE FUNCTION turas_hosted_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF ROW(NEW.id,NEW.environment_id,NEW.domain_kind,NEW.domain_job_id,NEW.source_generation,NEW.source_digest,
     NEW.creation_tag,NEW.image_digest,NEW.code_version,NEW.created_at,NEW.deadline_at,NEW.input_digest,NEW.input_bytes,NEW.budget_reservation_id)
   IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.domain_kind,OLD.domain_job_id,OLD.source_generation,OLD.source_digest,
     OLD.creation_tag,OLD.image_digest,OLD.code_version,OLD.created_at,OLD.deadline_at,OLD.input_digest,OLD.input_bytes,OLD.budget_reservation_id)
   OR OLD.provider_id IS NOT NULL AND NEW.provider_id IS DISTINCT FROM OLD.provider_id
   OR OLD.state IN('succeeded','failed','cancelled') THEN RAISE EXCEPTION 'Hosted job identity is immutable'; END IF;
  IF NEW.lease_id IS DISTINCT FROM OLD.lease_id OR NEW.lease_expires_at>NEW.deadline_at
   OR NEW.state<>OLD.state AND NOT (
    OLD.state='admitted' AND NEW.state IN('starting','cancelled','failed') OR
    OLD.state='starting' AND NEW.state IN('running','reconciling') OR
    OLD.state='running' AND NEW.state IN('succeeded','failed','reconciling') OR
    OLD.state='reconciling' AND NEW.state IN('cancelled','failed')) THEN
   RAISE EXCEPTION 'Invalid hosted job transition';
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER hosted_job_identity BEFORE UPDATE ON operations_hosted_jobs FOR EACH ROW EXECUTE FUNCTION turas_hosted_job_identity();
 CREATE TABLE operations_upload_capabilities(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),principal_id uuid NOT NULL REFERENCES principals(id),
  membership_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES login_sessions(id),
  domain_kind text NOT NULL CHECK(domain_kind IN('artifact','workforce')),domain_intent_id uuid NOT NULL,
  source_generation bigint NOT NULL CHECK(source_generation>=1),staging_key text NOT NULL UNIQUE,
  expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 1 AND 10485760),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','finished','revoked')),
  CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '10 minutes'),
  FOREIGN KEY(membership_id,principal_id,workspace_id) REFERENCES memberships(id,principal_id,workspace_id));
 CREATE UNIQUE INDEX upload_capability_active_intent ON operations_upload_capabilities(environment_id,domain_kind,domain_intent_id) WHERE state='prepared';
 CREATE FUNCTION turas_upload_capability_fence() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='INSERT' THEN
   PERFORM pg_advisory_xact_lock_shared(hashtextextended(NEW.environment_id,16017));
   IF NEW.state<>'prepared' OR NOT EXISTS(SELECT 1 FROM login_sessions s WHERE s.id=NEW.session_id
    AND s.principal_id=NEW.principal_id AND s.membership_id=NEW.membership_id AND s.workspace_id=NEW.workspace_id
    AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()) OR NOT EXISTS(SELECT 1 FROM operations_control
    WHERE environment_id=NEW.environment_id AND mode='open') THEN RAISE EXCEPTION 'Upload admission denied'; END IF;
  ELSIF ROW(NEW.id,NEW.environment_id,NEW.workspace_id,NEW.principal_id,NEW.membership_id,NEW.session_id,
   NEW.domain_kind,NEW.domain_intent_id,NEW.source_generation,NEW.staging_key,NEW.expected_bytes,NEW.issued_at,NEW.expires_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.workspace_id,OLD.principal_id,OLD.membership_id,OLD.session_id,
   OLD.domain_kind,OLD.domain_intent_id,OLD.source_generation,OLD.staging_key,OLD.expected_bytes,OLD.issued_at,OLD.expires_at)
   OR OLD.state<>'prepared' OR NEW.state='prepared' THEN RAISE EXCEPTION 'Upload capability is immutable'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER upload_capability_fence BEFORE INSERT OR UPDATE ON operations_upload_capabilities FOR EACH ROW EXECUTE FUNCTION turas_upload_capability_fence();
 CREATE FUNCTION turas_pilot_immutable_artifact_header() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Artifact header is immutable' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER artifact_header_no_update BEFORE UPDATE ON artifacts FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_artifact_header();
 CREATE TRIGGER artifact_batch_no_update BEFORE UPDATE ON artifact_upload_batches FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_artifact_header();
 -- Owner-provisioned operational spend authority is separate from customer truth.
 CREATE TABLE operations_cost_budgets(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  category text NOT NULL CHECK(category IN('hosting','blob','registry','sandbox','model','research','embedding','email')),
  authorization_digest text NOT NULL CHECK(authorization_digest ~ '^[a-f0-9]{64}$'),
  scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),
  pricing_digest text NOT NULL CHECK(pricing_digest ~ '^[a-f0-9]{64}$'),
  cap_micro_usd bigint NOT NULL CHECK(cap_micro_usd BETWEEN 1 AND 1000000000000),
  state text NOT NULL DEFAULT 'active' CHECK(state IN('active','revoked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL,
  CHECK(expires_at>created_at));
 CREATE TABLE operations_cost_reservations(
  id uuid PRIMARY KEY,budget_id uuid NOT NULL REFERENCES operations_cost_budgets(id),
  operation_digest text NOT NULL CHECK(operation_digest ~ '^[a-f0-9]{64}$'),
  upper_bound_micro_usd bigint NOT NULL CHECK(upper_bound_micro_usd BETWEEN 0 AND 1000000000000),
  state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','dispatched','unknown','settled','released')),
  job_id uuid UNIQUE,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),dispatched_at timestamptz,
  charged_micro_usd bigint CHECK(charged_micro_usd BETWEEN 0 AND 1000000000000),
  charge_kind text CHECK(charge_kind IN('actual','estimate')),
  CHECK((state='settled')=(charged_micro_usd IS NOT NULL AND charge_kind IS NOT NULL)),
  CHECK((charged_micro_usd IS NULL)=(charge_kind IS NULL)),
  CHECK((state IN('dispatched','unknown','settled'))=(dispatched_at IS NOT NULL)),
  CHECK(state NOT IN('dispatched','unknown','settled') OR job_id IS NOT NULL));
 CREATE UNIQUE INDEX cost_operation_once ON operations_cost_reservations(budget_id,operation_digest);
 CREATE TABLE operations_cost_reconciliations(
  reservation_id uuid PRIMARY KEY REFERENCES operations_cost_reservations(id),
  request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
  charge_evidence_digest text NOT NULL CHECK(charge_evidence_digest ~ '^[a-f0-9]{64}$'),
  operator_review_digest text NOT NULL CHECK(operator_review_digest ~ '^[a-f0-9]{64}$'),
  charged_micro_usd bigint NOT NULL CHECK(charged_micro_usd BETWEEN 0 AND 1000000000000),
  charge_kind text NOT NULL CHECK(charge_kind IN('actual','estimate')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE FUNCTION turas_pilot_immutable_cost_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Cost reconciliation receipt is immutable' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER cost_reconciliation_immutable BEFORE UPDATE OR DELETE ON operations_cost_reconciliations FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_cost_receipt();
 CREATE FUNCTION turas_cost_budget_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.id::text,16018));
  IF (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state')
   OR OLD.state='revoked' OR NEW.state=OLD.state THEN RAISE EXCEPTION 'Cost authority is immutable'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER cost_budget_identity BEFORE UPDATE ON operations_cost_budgets FOR EACH ROW EXECUTE FUNCTION turas_cost_budget_identity();
 CREATE FUNCTION turas_cost_reservation_fence() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE b operations_cost_budgets; committed bigint;
 BEGIN
  IF TG_OP='INSERT' OR OLD.state='reserved' AND NEW.state='dispatched' THEN
   PERFORM pg_advisory_xact_lock_shared(hashtextextended((SELECT environment_id FROM operations_cost_budgets WHERE id=NEW.budget_id),16017));
   IF NOT EXISTS(SELECT 1 FROM operations_cost_budgets budget JOIN operations_control control ON control.environment_id=budget.environment_id WHERE budget.id=NEW.budget_id AND control.mode='open') THEN
    RAISE EXCEPTION 'Operational cost admission is closed'; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.budget_id::text,16018));
  SELECT * INTO b FROM operations_cost_budgets WHERE id=NEW.budget_id;
  IF TG_OP='INSERT' THEN
   IF b.id IS NULL OR b.state<>'active' OR b.expires_at<=clock_timestamp()
    OR NEW.state<>'reserved' OR NEW.job_id IS NOT NULL OR NEW.dispatched_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM operations_cost_reservations WHERE budget_id=b.id AND state='unknown') THEN
    RAISE EXCEPTION 'Cost admission unavailable'; END IF;
   SELECT COALESCE(sum(CASE WHEN state='released' THEN 0
    WHEN state='settled' AND charge_kind='actual' THEN charged_micro_usd
    WHEN state='settled' THEN GREATEST(charged_micro_usd,upper_bound_micro_usd)
    ELSE upper_bound_micro_usd END),0) INTO committed FROM operations_cost_reservations WHERE budget_id=b.id;
   IF committed+NEW.upper_bound_micro_usd>b.cap_micro_usd THEN RAISE EXCEPTION 'Insufficient remaining budget'; END IF;
  ELSE
   IF ROW(NEW.id,NEW.budget_id,NEW.operation_digest,NEW.upper_bound_micro_usd,NEW.created_at)
    IS DISTINCT FROM ROW(OLD.id,OLD.budget_id,OLD.operation_digest,OLD.upper_bound_micro_usd,OLD.created_at)
    OR OLD.job_id IS NOT NULL AND NEW.job_id IS DISTINCT FROM OLD.job_id
    OR OLD.dispatched_at IS NOT NULL AND NEW.dispatched_at IS DISTINCT FROM OLD.dispatched_at
    OR OLD.state IN('settled','released') THEN RAISE EXCEPTION 'Cost reservation is immutable'; END IF;
   IF NEW.state<>OLD.state AND NOT (
    OLD.state='reserved' AND NEW.state IN('dispatched','released') OR
    OLD.state='dispatched' AND NEW.state IN('unknown','settled') OR
    OLD.state='unknown' AND NEW.state='settled') THEN RAISE EXCEPTION 'Invalid cost transition'; END IF;
   IF NEW.state='settled' AND NOT has_column_privilege(current_user,'operations_cost_reservations','charged_micro_usd','UPDATE') THEN
    RAISE EXCEPTION 'Owner charge reconciliation required'; END IF;
   IF NEW.state='settled' AND NOT EXISTS(SELECT 1 FROM operations_cost_reconciliations r WHERE r.reservation_id=NEW.id AND r.charged_micro_usd=NEW.charged_micro_usd AND r.charge_kind=NEW.charge_kind) THEN
    RAISE EXCEPTION 'Exact immutable charge reconciliation required'; END IF;
   IF OLD.state='reserved' AND NEW.state='dispatched' AND (b.state<>'active' OR b.expires_at<=clock_timestamp()
    OR EXISTS(SELECT 1 FROM operations_cost_reservations WHERE budget_id=b.id AND state='unknown')) THEN
    RAISE EXCEPTION 'Cost dispatch held'; END IF;
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER cost_reservation_fence BEFORE INSERT OR UPDATE ON operations_cost_reservations FOR EACH ROW EXECUTE FUNCTION turas_cost_reservation_fence();
 CREATE TABLE operations_replay_fences(
  environment_id text NOT NULL REFERENCES operations_control(environment_id),
  table_name text NOT NULL CHECK(table_name ~ '^[a-z_][a-z0-9_]*$'),
  key_columns text[] NOT NULL CHECK(cardinality(key_columns) BETWEEN 1 AND 16),
  key_digest text NOT NULL CHECK(key_digest ~ '^[a-f0-9]{64}$'),
  snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^[a-f0-9]{64}$'),
  source_captured_at timestamptz NOT NULL,recovery_id uuid NOT NULL,control_revision bigint NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,table_name,key_columns,key_digest));
 CREATE FUNCTION turas_replay_fence_admission() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user<>pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='operations_control'::regclass)) THEN
   RAISE EXCEPTION 'Replay fencing requires owner authority' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16020));
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.environment_id,16017));
  IF NOT EXISTS(SELECT 1 FROM operations_control WHERE environment_id=NEW.environment_id AND mode='locked'
   AND recovery_id=NEW.recovery_id AND revision=NEW.control_revision)
   OR NEW.source_captured_at>clock_timestamp() OR NEW.source_captured_at<clock_timestamp()-interval '5 minutes' THEN
   RAISE EXCEPTION 'Fresh exact locked replay proof required' USING ERRCODE='23514'; END IF;
  NEW.recorded_at:=clock_timestamp();RETURN NEW;
 END $$;
 CREATE TRIGGER replay_fence_admission BEFORE INSERT ON operations_replay_fences FOR EACH ROW EXECUTE FUNCTION turas_replay_fence_admission();
 CREATE TRIGGER replay_fence_immutable BEFORE UPDATE OR DELETE ON operations_replay_fences FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
 CREATE FUNCTION turas_recovery_replay_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE environment text; columns text[]; candidate jsonb; fingerprint text;
 BEGIN
  SELECT environment_id INTO STRICT environment FROM public.turas_environment;
  -- Locked owner reconciliation may retire a recovered row. Runtime workers
  -- cannot resume or lease it by UPDATE instead of repeating its INSERT.
  IF TG_OP='UPDATE' AND session_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='public.operations_control'::regclass))
   AND EXISTS(SELECT 1 FROM public.operations_control WHERE environment_id=environment AND mode='locked' AND recovery_id IS NOT NULL)
   THEN RETURN NEW; END IF;
  FOR columns IN SELECT DISTINCT key_columns FROM public.operations_replay_fences WHERE environment_id=environment AND table_name=TG_TABLE_NAME LOOP
   SELECT jsonb_object_agg(e.key,e.value ORDER BY e.key) INTO candidate FROM jsonb_each(to_jsonb(NEW)) e WHERE e.key=ANY(columns);
   IF candidate IS NULL OR (SELECT count(*) FROM jsonb_object_keys(candidate))<>cardinality(columns) THEN
    RAISE EXCEPTION 'Replay identity schema differs' USING ERRCODE='23514'; END IF;
   -- Ordinary unique indexes allow multiple NULL identities. An absent native
   -- request ID must not fence every future undispatched request.
   IF EXISTS(SELECT 1 FROM jsonb_each(candidate) e WHERE e.value='null'::jsonb) THEN CONTINUE; END IF;
   fingerprint:=encode(sha256(convert_to(candidate::text,'UTF8')),'hex');
   IF EXISTS(SELECT 1 FROM public.operations_replay_fences WHERE environment_id=environment AND table_name=TG_TABLE_NAME AND key_columns=columns AND key_digest=fingerprint) THEN
    RAISE EXCEPTION 'Recovered permanent request cannot be repeated' USING ERRCODE='23514'; END IF;
  END LOOP;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_recovery_replay_guard() FROM PUBLIC;
 DO $$ DECLARE receipt record; BEGIN
  FOR receipt IN SELECT c.relname AS tablename FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND (c.relname IN('event_projections','general_context_injections','general_context_receipts','general_customer_read_scopes','native_input_resume_windows','ordinary_context_refreshes','ordinary_continuation_authorities','ordinary_conversation_allowances','ordinary_evidence_refreshes','ordinary_intervention_authorizations','ordinary_intervention_decisions','ordinary_model_operations','ordinary_native_retirements','ordinary_native_uploads','ordinary_operations_read_dependencies','ordinary_question_continuations','ordinary_question_posts','ordinary_question_reconstructions','ordinary_steering_deliveries','parity_evaluation_budgets','parity_evaluation_operations','session_evidence_dependencies','retrieval_embedding_operations') OR EXISTS(
    SELECT 1 FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ordinal)
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum
    WHERE i.indrelid=c.oid AND i.indisunique AND i.indpred IS NULL AND i.indexprs IS NULL
     AND k.ordinal<=i.indnkeyatts AND a.attname IN('request_key','idempotency_key','native_request_id','provider_key','binding_id'))) LOOP
   EXECUTE format('CREATE TRIGGER recovered_request_replay BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.turas_recovery_replay_guard()',receipt.tablename);
  END LOOP;
 END $$;

 CREATE TABLE operations_source_denials(
  environment_id text NOT NULL REFERENCES operations_control(environment_id),recovery_id uuid NOT NULL,control_revision bigint NOT NULL,
  source_kind text NOT NULL CHECK(source_kind IN('accepted_profile','artifact_version','verified_research','shared_publication')),
  source_id uuid NOT NULL,observed_target_generation bigint NOT NULL CHECK(observed_target_generation>=0),
  snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^[a-f0-9]{64}$'),source_captured_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,recovery_id,source_kind,source_id,snapshot_digest));
 CREATE TRIGGER source_denial_admission BEFORE INSERT ON operations_source_denials FOR EACH ROW EXECUTE FUNCTION turas_replay_fence_admission();
 CREATE TRIGGER source_denial_immutable BEFORE UPDATE OR DELETE ON operations_source_denials FOR EACH ROW EXECUTE FUNCTION turas_pilot_immutable_recovery_receipt();
`);
