exports.up = pgm => pgm.sql(`
 CREATE TABLE gap_workspace_state (
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  relation_generation bigint NOT NULL DEFAULT 1 CHECK(relation_generation BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY(environment_id,workspace_id));
 INSERT INTO gap_workspace_state(environment_id,workspace_id) SELECT e.environment_id,w.id FROM turas_environment e CROSS JOIN workspaces w;
 CREATE FUNCTION turas_gap_workspace_insert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  INSERT INTO public.gap_workspace_state(environment_id,workspace_id) SELECT environment_id,NEW.id FROM public.turas_environment ON CONFLICT DO NOTHING;RETURN NEW;END $$;
 CREATE TRIGGER gap_workspace_insert AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION turas_gap_workspace_insert();
 CREATE TABLE product_gaps (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,creator_membership_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),working_revision_id uuid,reviewed_revision_id uuid,
  disposition text NOT NULL DEFAULT 'open' CHECK(disposition IN('open','deferred','dismissed')),revisit_at timestamptz,
  canonical_state text NOT NULL DEFAULT 'active' CHECK(canonical_state IN('active','redirected')),canonical_target uuid,
  last_review_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES gap_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(creator_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id),
  CHECK((canonical_state='redirected')=(canonical_target IS NOT NULL)),CHECK(canonical_target IS DISTINCT FROM id),
  CHECK((disposition='deferred')=(revisit_at IS NOT NULL)));
 ALTER TABLE product_gaps ADD FOREIGN KEY(canonical_target,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id);
 CREATE TABLE gap_impact_observations (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,original_gap_id uuid NOT NULL,customer_id uuid NOT NULL,
  workload_id uuid,engagement_id uuid,recurrence_parent uuid,creator_membership_id uuid NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),working_revision_id uuid,reviewed_revision_id uuid,
  state text NOT NULL DEFAULT 'active' CHECK(state IN('active','retired')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(original_gap_id,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
  FOREIGN KEY(workload_id,customer_id,workspace_id) REFERENCES customer_workloads(id,customer_id,workspace_id),
  FOREIGN KEY(creator_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id),UNIQUE(id,original_gap_id),
  UNIQUE(id,customer_id,workspace_id),FOREIGN KEY(recurrence_parent,customer_id,workspace_id) REFERENCES gap_impact_observations(id,customer_id,workspace_id),CHECK(recurrence_parent IS DISTINCT FROM id));
 CREATE TABLE gap_revisions (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,gap_id uuid NOT NULL,impact_id uuid,
  revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),author_membership_id uuid NOT NULL,
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(gap_id,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id),
  FOREIGN KEY(impact_id,gap_id) REFERENCES gap_impact_observations(id,original_gap_id),
  FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id),UNIQUE(id,gap_id),UNIQUE(id,impact_id));
 CREATE UNIQUE INDEX gap_revision_number ON gap_revisions(gap_id,revision_number) WHERE impact_id IS NULL;
 CREATE UNIQUE INDEX gap_impact_revision_number ON gap_revisions(impact_id,revision_number) WHERE impact_id IS NOT NULL;
 ALTER TABLE product_gaps ADD FOREIGN KEY(working_revision_id,id) REFERENCES gap_revisions(id,gap_id);
 ALTER TABLE product_gaps ADD FOREIGN KEY(reviewed_revision_id,id) REFERENCES gap_revisions(id,gap_id);
 ALTER TABLE gap_impact_observations ADD FOREIGN KEY(working_revision_id,id) REFERENCES gap_revisions(id,impact_id);
 ALTER TABLE gap_impact_observations ADD FOREIGN KEY(reviewed_revision_id,id) REFERENCES gap_revisions(id,impact_id);
 CREATE TABLE gap_revision_payloads (revision_id uuid PRIMARY KEY REFERENCES gap_revisions(id),content jsonb NOT NULL CHECK(octet_length(content::text)<=262144));
 CREATE TABLE gap_revision_states (revision_id uuid PRIMARY KEY REFERENCES gap_revisions(id),generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),invalidated_at timestamptz,purge_at timestamptz,eligibility_recheck_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX gap_revision_recheck ON gap_revision_states(eligibility_recheck_at,revision_id) WHERE invalidated_at IS NULL;
 CREATE TABLE gap_source_dependencies (
  id uuid PRIMARY KEY,revision_id uuid NOT NULL REFERENCES gap_revisions(id),customer_id uuid,
  source_kind text NOT NULL CHECK(source_kind IN('accepted_profile','approved_excerpt','verified_research','shared_knowledge','execution_record','milestone_baseline')),
  source_revision_id uuid NOT NULL,source_generation bigint NOT NULL CHECK(source_generation BETWEEN 1 AND 9007199254740991),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  reference jsonb NOT NULL,UNIQUE(revision_id,source_kind,source_revision_id));
 CREATE INDEX gap_source_reverse ON gap_source_dependencies(source_kind,source_revision_id,revision_id);
 CREATE TABLE gap_decisions (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,gap_id uuid NOT NULL,impact_id uuid,revision_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('accept','reject','defer','dismiss','reopen','retire')),
  reviewer_membership_id uuid,rationale_digest text NOT NULL CHECK(rationale_digest ~ '^[a-f0-9]{64}$'),binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  disposition text NOT NULL CHECK(disposition IN('open','deferred','dismissed')),revisit_at timestamptz,self_review boolean NOT NULL,customer_independent_acknowledgment boolean NOT NULL DEFAULT false,
  CHECK(impact_id IS NOT NULL OR action<>'accept' OR customer_independent_acknowledgment),
  reviewed_gap_revision_id uuid,reviewed_kind text,reviewed_product_key text,
  FOREIGN KEY(reviewed_gap_revision_id,environment_id,workspace_id) REFERENCES gap_revisions(id,environment_id,workspace_id),
  CHECK(impact_id IS NULL OR action<>'accept' OR (reviewed_gap_revision_id IS NOT NULL AND reviewed_kind IS NOT NULL AND reviewed_product_key IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(gap_id,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id),
  FOREIGN KEY(revision_id,gap_id) REFERENCES gap_revisions(id,gap_id),FOREIGN KEY(revision_id,impact_id) REFERENCES gap_revisions(id,impact_id),FOREIGN KEY(impact_id,gap_id) REFERENCES gap_impact_observations(id,original_gap_id),
  FOREIGN KEY(reviewer_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE INDEX gap_impact_cutoff ON gap_decisions(impact_id,created_at DESC,id DESC) WHERE action IN('accept','retire');
 CREATE TABLE gap_audit_payloads (id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),purge_at timestamptz,
  FOREIGN KEY(environment_id,workspace_id) REFERENCES gap_workspace_state(environment_id,workspace_id));
 CREATE TABLE gap_previews (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,actor_membership_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES login_sessions(id),
  operation text NOT NULL,record_id uuid,binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES gap_workspace_state(environment_id,workspace_id),FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
 CREATE TABLE gap_preview_payloads(preview_id uuid PRIMARY KEY REFERENCES gap_previews(id),content jsonb NOT NULL);
 CREATE TABLE gap_canonicalization_decisions (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN('merge','split')),
  binding_digest text NOT NULL,reviewer_membership_id uuid,relation_generation bigint NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES gap_workspace_state(environment_id,workspace_id),FOREIGN KEY(reviewer_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE TABLE gap_assignment_events (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,observation_id uuid NOT NULL,canonical_gap_id uuid NOT NULL,
  decision_id uuid,FOREIGN KEY(decision_id,environment_id,workspace_id) REFERENCES gap_canonicalization_decisions(id,environment_id,workspace_id),UNIQUE(id,observation_id,canonical_gap_id,environment_id,workspace_id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(observation_id,environment_id,workspace_id) REFERENCES gap_impact_observations(id,environment_id,workspace_id),FOREIGN KEY(canonical_gap_id,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id));
 CREATE TABLE gap_observation_assignments (
  observation_id uuid PRIMARY KEY REFERENCES gap_impact_observations(id),environment_id text NOT NULL,workspace_id uuid NOT NULL,canonical_gap_id uuid NOT NULL,event_id uuid NOT NULL,FOREIGN KEY(event_id,observation_id,canonical_gap_id,environment_id,workspace_id) REFERENCES gap_assignment_events(id,observation_id,canonical_gap_id,environment_id,workspace_id),
  FOREIGN KEY(observation_id,environment_id,workspace_id) REFERENCES gap_impact_observations(id,environment_id,workspace_id),FOREIGN KEY(canonical_gap_id,environment_id,workspace_id) REFERENCES product_gaps(id,environment_id,workspace_id));
 CREATE INDEX gap_assignment_gap ON gap_observation_assignments(canonical_gap_id,observation_id);
 CREATE TABLE gap_request_receipts (
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,actor_membership_id uuid NOT NULL,request_key uuid NOT NULL,operation text NOT NULL,
  input_digest text NOT NULL,record_id uuid,result_id uuid,binding_digest text,outcome text NOT NULL,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES gap_workspace_state(environment_id,workspace_id),FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(environment_id,workspace_id,actor_membership_id,operation,request_key));
 CREATE TABLE gap_expired_request_keys(key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'));
 CREATE INDEX gap_receipt_expiry ON gap_request_receipts(environment_id,created_at,id);
 CREATE VIEW gap_impact_revisions AS SELECT * FROM gap_revisions WHERE impact_id IS NOT NULL;
 CREATE VIEW gap_impact_decisions AS SELECT * FROM gap_decisions WHERE impact_id IS NOT NULL;
 CREATE FUNCTION turas_gap_head_kind() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM gap_revisions WHERE id IN(NEW.working_revision_id,NEW.reviewed_revision_id) AND impact_id IS NOT NULL) THEN RAISE EXCEPTION 'Gap head must be narrative' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER gap_head_kind BEFORE INSERT OR UPDATE ON product_gaps FOR EACH ROW EXECUTE FUNCTION turas_gap_head_kind();
 CREATE FUNCTION turas_gap_decision_target() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (SELECT impact_id FROM gap_revisions WHERE id=NEW.revision_id) IS DISTINCT FROM NEW.impact_id THEN RAISE EXCEPTION 'Decision revision target differs' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER gap_decision_target BEFORE INSERT ON gap_decisions FOR EACH ROW EXECUTE FUNCTION turas_gap_decision_target();
 CREATE FUNCTION turas_gap_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=TG_RELID) AND current_setting('turas.gap_cleanup',true)='yes' THEN RETURN COALESCE(NEW,OLD); END IF;
  RAISE EXCEPTION 'Gap history is append only' USING ERRCODE='23514';END $$;
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['gap_revisions','gap_decisions','gap_source_dependencies','gap_canonicalization_decisions','gap_assignment_events','gap_request_receipts','gap_previews'] LOOP
  EXECUTE format('CREATE TRIGGER gap_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_gap_immutable()',t);END LOOP;END $$;
 CREATE FUNCTION turas_gap_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_TABLE_NAME='product_gaps' THEN
   IF EXISTS(SELECT 1 FROM gap_revisions WHERE id IN(NEW.working_revision_id,NEW.reviewed_revision_id) AND impact_id IS NOT NULL) THEN RAISE EXCEPTION 'Gap head must be a narrative revision' USING ERRCODE='23514';END IF;
   IF ROW(NEW.id,NEW.environment_id,NEW.workspace_id,NEW.creator_membership_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.workspace_id,OLD.creator_membership_id,OLD.created_at) THEN RAISE EXCEPTION 'Gap identity is immutable' USING ERRCODE='23514';END IF;END IF;
  IF TG_TABLE_NAME='gap_impact_observations' THEN IF ROW(NEW.id,NEW.environment_id,NEW.workspace_id,NEW.original_gap_id,NEW.customer_id,NEW.workload_id,NEW.engagement_id,NEW.recurrence_parent,NEW.creator_membership_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.workspace_id,OLD.original_gap_id,OLD.customer_id,OLD.workload_id,OLD.engagement_id,OLD.recurrence_parent,OLD.creator_membership_id,OLD.created_at) THEN RAISE EXCEPTION 'Impact identity is immutable' USING ERRCODE='23514';END IF;END IF;
  RETURN NEW;END $$;
 CREATE TRIGGER gap_identity BEFORE UPDATE ON product_gaps FOR EACH ROW EXECUTE FUNCTION turas_gap_identity();
 CREATE TRIGGER impact_identity BEFORE UPDATE ON gap_impact_observations FOR EACH ROW EXECUTE FUNCTION turas_gap_identity();
 CREATE FUNCTION turas_gap_invalidate_source(source_type text,source_revision uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 BEGIN
  UPDATE public.gap_revision_states s SET invalidated_at=COALESCE(s.invalidated_at,clock_timestamp()),purge_at=LEAST(COALESCE(s.purge_at,clock_timestamp()+interval '24 hours'),clock_timestamp()+interval '24 hours'),generation=s.generation+1
   WHERE s.invalidated_at IS NULL AND s.revision_id IN(SELECT d.revision_id FROM public.gap_source_dependencies d WHERE d.source_kind=source_type AND d.source_revision_id=source_revision);
  IF to_regclass('public.gap_report_revision_states') IS NOT NULL THEN
   EXECUTE 'UPDATE public.gap_report_revision_states s SET invalidated_at=COALESCE(s.invalidated_at,clock_timestamp()),purge_at=LEAST(COALESCE(s.purge_at,clock_timestamp()+interval ''24 hours''),clock_timestamp()+interval ''24 hours'') WHERE s.revision_id IN(SELECT report_revision_id FROM public.gap_report_dependencies WHERE source_kind=$1 AND source_revision_id=$2)' USING source_type,source_revision;
  END IF;
  IF to_regclass('public.gap_handoff_dependencies') IS NOT NULL THEN EXECUTE 'SELECT public.turas_gap_handoff_invalidate_source($1,$2)' USING source_type,source_revision;END IF;
 END $$;
 REVOKE ALL ON FUNCTION turas_gap_invalidate_source(text,uuid) FROM PUBLIC;
 CREATE FUNCTION turas_gap_source_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 BEGIN
  IF TG_TABLE_NAME='profile_records' THEN IF OLD.current_accepted_revision_id IS DISTINCT FROM NEW.current_accepted_revision_id THEN
   PERFORM public.turas_gap_invalidate_source('accepted_profile',OLD.current_accepted_revision_id);
  END IF; ELSIF TG_TABLE_NAME='evidence_source_events' THEN IF NEW.event_type IN('withdraw','supersede') THEN
   PERFORM public.turas_gap_invalidate_source('verified_research',NEW.source_revision_id);
  END IF; ELSIF TG_TABLE_NAME='knowledge_publications' THEN IF OLD.state IS DISTINCT FROM NEW.state THEN
   PERFORM public.turas_gap_invalidate_source('shared_knowledge',OLD.revision_id);
  END IF; ELSIF TG_TABLE_NAME='artifact_versions' THEN IF OLD.state IS DISTINCT FROM NEW.state OR OLD.lifecycle_generation IS DISTINCT FROM NEW.lifecycle_generation THEN
   PERFORM public.turas_gap_invalidate_source('approved_excerpt',s.id) FROM public.artifact_evidence_selections s WHERE s.version_id=NEW.id;
  END IF;END IF;
  RETURN NEW;END $$;
 CREATE TRIGGER gap_profile_source_change AFTER UPDATE ON profile_records FOR EACH ROW EXECUTE FUNCTION turas_gap_source_change();
 CREATE TRIGGER gap_research_source_change AFTER INSERT ON evidence_source_events FOR EACH ROW EXECUTE FUNCTION turas_gap_source_change();
 CREATE TRIGGER gap_shared_source_change AFTER UPDATE ON knowledge_publications FOR EACH ROW EXECUTE FUNCTION turas_gap_source_change();
 CREATE TRIGGER gap_excerpt_source_change AFTER UPDATE ON artifact_versions FOR EACH ROW EXECUTE FUNCTION turas_gap_source_change();
 CREATE FUNCTION turas_gap_conflict_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF NEW.state='confirmed' THEN
   IF TG_TABLE_NAME='evidence_conflict_targets' THEN
    PERFORM public.turas_gap_invalidate_source(CASE WHEN NEW.first_kind='published_shared' THEN 'shared_knowledge' ELSE NEW.first_kind END,NEW.first_revision_id);
    PERFORM public.turas_gap_invalidate_source(CASE WHEN NEW.second_kind='published_shared' THEN 'shared_knowledge' ELSE NEW.second_kind END,NEW.second_revision_id);
   ELSE
    PERFORM public.turas_gap_invalidate_source('accepted_profile',NEW.first_revision_id);
    PERFORM public.turas_gap_invalidate_source('accepted_profile',NEW.second_revision_id);
   END IF;
  END IF;RETURN NEW;END $$;
 CREATE TRIGGER gap_typed_conflict_change AFTER INSERT OR UPDATE ON evidence_conflict_targets FOR EACH ROW EXECUTE FUNCTION turas_gap_conflict_change();
 CREATE TRIGGER gap_legacy_conflict_change AFTER INSERT OR UPDATE ON evidence_conflicts FOR EACH ROW EXECUTE FUNCTION turas_gap_conflict_change();
 CREATE FUNCTION turas_gap_execution_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF TG_TABLE_NAME='execution_records' THEN
   IF OLD.accepted_revision_id IS DISTINCT FROM NEW.accepted_revision_id THEN PERFORM public.turas_gap_invalidate_source('execution_record',OLD.accepted_revision_id);END IF;
  ELSIF TG_TABLE_NAME='engagements' THEN
   IF OLD.active_baseline_id IS DISTINCT FROM NEW.active_baseline_id THEN PERFORM public.turas_gap_invalidate_source('milestone_baseline',OLD.active_baseline_id);END IF;
  END IF;RETURN NEW;END $$;
 CREATE TRIGGER gap_execution_change AFTER UPDATE ON execution_records FOR EACH ROW EXECUTE FUNCTION turas_gap_execution_change();
 CREATE TRIGGER gap_baseline_change AFTER UPDATE ON engagements FOR EACH ROW EXECUTE FUNCTION turas_gap_execution_change();
 CREATE FUNCTION turas_gap_expire_receipt(expected_environment text,target uuid,hashes text[]) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE r public.gap_request_receipts%ROWTYPE;BEGIN
  IF hashes IS NULL OR cardinality(hashes) NOT BETWEEN 1 AND 32 OR EXISTS(SELECT 1 FROM unnest(hashes) h WHERE h !~ '^[a-f0-9]{64}$' OR h IS NULL) THEN RETURN false;END IF;
  SELECT * INTO r FROM public.gap_request_receipts WHERE id=target AND environment_id=expected_environment;
  IF NOT FOUND THEN RETURN false;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('gap-request:'||r.environment_id||':'||r.workspace_id::text||':'||r.actor_membership_id::text||':'||r.operation||':'||r.request_key::text,0));
  SELECT * INTO r FROM public.gap_request_receipts WHERE id=target AND environment_id=expected_environment FOR UPDATE;
  IF NOT FOUND OR r.created_at>clock_timestamp()-interval '365 days' THEN RETURN false;END IF;
  INSERT INTO public.gap_expired_request_keys SELECT unnest(hashes) ON CONFLICT DO NOTHING;
  PERFORM set_config('turas.gap_cleanup','yes',true);DELETE FROM public.gap_request_receipts WHERE id=target;PERFORM set_config('turas.gap_cleanup','',true);RETURN true;END $$;
 REVOKE ALL ON FUNCTION turas_gap_expire_receipt(text,uuid,text[]) FROM PUBLIC;
 CREATE FUNCTION turas_gap_purge_payloads(expected_environment text,batch_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 DECLARE affected integer;BEGIN
  IF batch_limit NOT BETWEEN 1 AND 100 THEN RETURN 0;END IF;
  WITH obsolete AS(SELECT r.id,r.created_at FROM public.gap_revisions r JOIN public.gap_revision_states s ON s.revision_id=r.id
   WHERE r.environment_id=expected_environment AND r.created_at<=clock_timestamp()-interval '90 days' AND s.purge_at IS NULL
   AND NOT EXISTS(SELECT 1 FROM public.product_gaps g WHERE g.working_revision_id=r.id OR g.reviewed_revision_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM public.gap_impact_observations o WHERE o.working_revision_id=r.id OR o.reviewed_revision_id=r.id)
   ORDER BY r.created_at,r.id LIMIT batch_limit)
  UPDATE public.gap_revision_states s SET purge_at=r.created_at+interval '90 days' FROM obsolete r WHERE s.revision_id=r.id;
  WITH due AS(SELECT s.revision_id FROM public.gap_revision_states s JOIN public.gap_revisions r ON r.id=s.revision_id WHERE r.environment_id=expected_environment AND s.purge_at<=clock_timestamp() ORDER BY s.purge_at,s.revision_id LIMIT batch_limit FOR UPDATE OF s SKIP LOCKED)
   DELETE FROM public.gap_revision_payloads WHERE revision_id IN(SELECT revision_id FROM due);GET DIAGNOSTICS affected=ROW_COUNT;
  PERFORM set_config('turas.gap_cleanup','yes',true);
  DELETE FROM public.gap_preview_payloads WHERE preview_id IN(SELECT id FROM public.gap_previews WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  DELETE FROM public.gap_previews WHERE id IN(SELECT id FROM public.gap_previews WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.gap_preview_payloads p WHERE p.preview_id=gap_previews.id) ORDER BY expires_at,id LIMIT batch_limit);
  DELETE FROM public.gap_audit_payloads WHERE id IN(SELECT id FROM public.gap_audit_payloads WHERE environment_id=expected_environment AND (purge_at<=clock_timestamp() OR created_at<=clock_timestamp()-interval '365 days') ORDER BY id LIMIT batch_limit);
  PERFORM set_config('turas.gap_cleanup','',true);RETURN affected;END $$;
 REVOKE ALL ON FUNCTION turas_gap_purge_payloads(text,integer) FROM PUBLIC;
`);
exports.down = () => {throw Error('Gap history requires forward recovery');};
