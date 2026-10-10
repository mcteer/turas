exports.up = pgm => pgm.sql(`
 CREATE FUNCTION turas_learning_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' AND current_setting('turas.learning_purge',true)='on'
    AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID))
    AND TG_TABLE_NAME LIKE '%payloads' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND current_setting('turas.learning_purge',true)='on'
    AND current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)) THEN
   IF TG_TABLE_NAME='learning_command_receipts' THEN
   IF OLD.created_at<=clock_timestamp()-interval '365 days'
    AND NEW.outcome='retired' AND NEW.target_id IS NULL AND NEW.version IS NULL AND NEW.created_at IS NULL
    AND (to_jsonb(NEW)-ARRAY['outcome','target_id','version','created_at'])=(to_jsonb(OLD)-ARRAY['outcome','target_id','version','created_at']) THEN RETURN NEW; END IF; END IF;
   IF TG_TABLE_NAME='learning_rollback_records' THEN
    IF OLD.created_at<=clock_timestamp()-interval '365 days' AND NEW.minimized AND NEW.actor_membership_id IS NULL AND NEW.created_at IS NULL
     AND (to_jsonb(NEW)-ARRAY['minimized','actor_membership_id','created_at'])=(to_jsonb(OLD)-ARRAY['minimized','actor_membership_id','created_at'])
     AND NOT EXISTS(SELECT 1 FROM learning_rollback_payloads WHERE rollback_id=OLD.id) THEN RETURN NEW; END IF;
   END IF;
   IF TG_TABLE_NAME='learning_candidate_reviews' THEN
   IF OLD.created_at<=clock_timestamp()-interval '365 days'
    AND NEW.minimized AND NEW.reviewer_membership_id IS NULL AND NEW.reviewer_generation IS NULL AND NEW.created_at IS NULL
    AND (to_jsonb(NEW)-ARRAY['minimized','reviewer_membership_id','reviewer_generation','created_at'])=(to_jsonb(OLD)-ARRAY['minimized','reviewer_membership_id','reviewer_generation','created_at'])
    AND EXISTS(SELECT 1 FROM learning_review_states WHERE review_id=OLD.id AND revoked_at IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM learning_review_payloads WHERE review_id=OLD.id) THEN RETURN NEW; END IF; END IF;
  END IF;
  RAISE EXCEPTION 'Learning history is immutable' USING ERRCODE='23514';
 END $$;
 CREATE FUNCTION turas_learning_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE allowed text[]:=string_to_array(TG_ARGV[0],',');field_name text; BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Learning identity cannot be deleted' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-allowed) IS DISTINCT FROM (to_jsonb(OLD)-allowed) THEN
   RAISE EXCEPTION 'Learning identity is immutable' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)?'version') AND (to_jsonb(NEW)->>'version')::bigint<(to_jsonb(OLD)->>'version')::bigint THEN RAISE EXCEPTION 'Learning generation cannot decrease' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)?'purge_at') AND (to_jsonb(OLD)->>'purge_at') IS NOT NULL AND ((to_jsonb(NEW)->>'purge_at') IS NULL OR (to_jsonb(NEW)->>'purge_at')::timestamptz>(to_jsonb(OLD)->>'purge_at')::timestamptz) THEN
   RAISE EXCEPTION 'Learning retention deadline cannot increase' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->>'revoked_at') IS NOT NULL AND (to_jsonb(NEW)->>'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)->>'revoked_at') THEN RAISE EXCEPTION 'Reuse revocation is irreversible' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->>'invalidated_at') IS NOT NULL AND ((to_jsonb(NEW)->>'invalidated_at') IS NULL OR (to_jsonb(NEW)->>'invalidated_at')::timestamptz>(to_jsonb(OLD)->>'invalidated_at')::timestamptz) THEN RAISE EXCEPTION 'Invalidation cannot be reversed' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(OLD)->>'obsolete_at') IS NOT NULL AND ((to_jsonb(NEW)->>'obsolete_at') IS NULL OR (to_jsonb(NEW)->>'obsolete_at')::timestamptz>(to_jsonb(OLD)->>'obsolete_at')::timestamptz) THEN RAISE EXCEPTION 'Obsolescence cannot be postponed' USING ERRCODE='23514'; END IF;
  FOREACH field_name IN ARRAY ARRAY['response_attempt_id','native_request_id','native_session_id','native_turn_id','output_digest'] LOOP
   IF (to_jsonb(OLD)->>field_name) IS NOT NULL AND (to_jsonb(NEW)->>field_name) IS DISTINCT FROM (to_jsonb(OLD)->>field_name)
   THEN RAISE EXCEPTION 'Learning captured identity cannot change' USING ERRCODE='23514'; END IF;
  END LOOP;
  FOREACH field_name IN ARRAY ARRAY['context_bytes','model_steps','read_calls','output_tokens'] LOOP
   IF (to_jsonb(OLD)->>field_name) IS NOT NULL AND (to_jsonb(NEW)->>field_name)::bigint<(to_jsonb(OLD)->>field_name)::bigint
   THEN RAISE EXCEPTION 'Learning accounting cannot decrease' USING ERRCODE='23514'; END IF;
  END LOOP;
  IF (to_jsonb(OLD)->>'deadline_at') IS NOT NULL AND ((to_jsonb(NEW)->>'deadline_at') IS NULL OR (to_jsonb(NEW)->>'deadline_at')::timestamptz>(to_jsonb(OLD)->>'deadline_at')::timestamptz)
  THEN RAISE EXCEPTION 'Learning dispatch deadline cannot increase' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 CREATE TABLE learning_workspace_state(
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),enabled boolean NOT NULL DEFAULT false,
  gate_activated_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(environment_id,workspace_id));
 INSERT INTO learning_workspace_state(environment_id,workspace_id) SELECT e.environment_id,w.id FROM turas_environment e CROSS JOIN workspaces w;
 CREATE FUNCTION turas_learning_activation_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF OLD.gate_activated_at IS NOT NULL AND NEW.gate_activated_at IS DISTINCT FROM OLD.gate_activated_at THEN
   RAISE EXCEPTION 'Learning gate activation is irreversible' USING ERRCODE='23514'; END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_activation_guard BEFORE UPDATE ON learning_workspace_state FOR EACH ROW EXECUTE FUNCTION turas_learning_activation_guard();
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_workspace_state FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,enabled,gate_activated_at');
 CREATE FUNCTION turas_learning_lock_state(expected_environment text,expected_workspace uuid)
 RETURNS TABLE(version bigint,enabled boolean,gate_activated_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment) THEN RAISE EXCEPTION 'Learning environment mismatch';END IF;
  RETURN QUERY SELECT s.version,s.enabled,s.gate_activated_at FROM public.learning_workspace_state s
    WHERE s.environment_id=expected_environment AND s.workspace_id=expected_workspace FOR SHARE;
 END $$;
 REVOKE ALL ON FUNCTION turas_learning_lock_state(text,uuid) FROM PUBLIC;
 CREATE TABLE learning_feedback(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,author_membership_id uuid NOT NULL,
  customer_id uuid,target_kind text NOT NULL CHECK(target_kind IN('shared_practice','report','gap_observation','partner_guide','own_checkpoint')),
  target_id uuid NOT NULL,target_revision_id uuid NOT NULL,target_generation bigint NOT NULL CHECK(target_generation BETWEEN 1 AND 9007199254740991),
  target_digest text NOT NULL CHECK(target_digest ~ '^[a-f0-9]{64}$'),
  category text NOT NULL CHECK(category IN('unclear','stale','ineffective','correction','missing_guidance')),
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),head_revision_id uuid,
  disposition text NOT NULL DEFAULT 'open' CHECK(disposition IN('open','under_review','linked','deferred','dismissed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE INDEX learning_feedback_queue ON learning_feedback(environment_id,workspace_id,created_at DESC,id DESC);
 CREATE INDEX learning_feedback_author ON learning_feedback(author_membership_id,created_at DESC,id DESC);
 CREATE TABLE learning_feedback_revisions(
  id uuid PRIMARY KEY,feedback_id uuid NOT NULL REFERENCES learning_feedback(id),revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),author_membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(feedback_id,revision_number),UNIQUE(id,feedback_id));
 ALTER TABLE learning_feedback ADD FOREIGN KEY(head_revision_id,id) REFERENCES learning_feedback_revisions(id,feedback_id);
 CREATE TABLE learning_feedback_payloads(revision_id uuid PRIMARY KEY REFERENCES learning_feedback_revisions(id),
  content json NOT NULL CHECK(octet_length(content::text)<=16384 AND json_typeof(content)='object'
   AND coalesce(json_typeof(content->'text')='string',false) AND length(btrim(content->>'text')) BETWEEN 1 AND 2000));
 CREATE TABLE learning_payload_states(
  owner_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('feedback','disposition','review','attempt','case_review','measurement','measurement_review','settlement','command','evaluation','rollback')),
  invalidated_at timestamptz,obsolete_at timestamptz,purge_at timestamptz,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(kind,owner_id));
 CREATE INDEX learning_payload_purge_due ON learning_payload_states(purge_at,kind,owner_id) WHERE purge_at IS NOT NULL;
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_payload_states FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('invalidated_at,obsolete_at,purge_at');
 CREATE TABLE learning_feedback_dispositions(
  id uuid PRIMARY KEY,feedback_id uuid NOT NULL REFERENCES learning_feedback(id),version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
  actor_membership_id uuid NOT NULL REFERENCES memberships(id),state text NOT NULL CHECK(state IN('open','under_review','linked','deferred','dismissed')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(feedback_id,version));
 CREATE TABLE learning_disposition_payloads(disposition_id uuid PRIMARY KEY REFERENCES learning_feedback_dispositions(id),
  content json NOT NULL CHECK(octet_length(content::text)<=16384 AND coalesce(json_typeof(content->'rationale')='string',false) AND length(btrim(content->>'rationale')) BETWEEN 1 AND 2000));
 CREATE TABLE learning_feedback_links(id uuid PRIMARY KEY,disposition_id uuid NOT NULL UNIQUE REFERENCES learning_feedback_dispositions(id),
  candidate_revision_id uuid NOT NULL REFERENCES knowledge_revisions(id));
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_feedback FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,head_revision_id,disposition');
 CREATE TABLE learning_candidate_reviews(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,contribution_id uuid NOT NULL,
  revision_id uuid NOT NULL,revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),
  rights_digest text NOT NULL CHECK(rights_digest ~ '^[a-f0-9]{64}$'),reviewer_membership_id uuid,
  reviewer_generation bigint CHECK(reviewer_generation BETWEEN 1 AND 9007199254740991),decision text NOT NULL CHECK(decision IN('accept','reject')),
  created_at timestamptz DEFAULT clock_timestamp(),minimized boolean NOT NULL DEFAULT false,
  CHECK((minimized AND reviewer_membership_id IS NULL AND reviewer_generation IS NULL AND created_at IS NULL) OR (NOT minimized AND reviewer_membership_id IS NOT NULL AND reviewer_generation IS NOT NULL AND created_at IS NOT NULL)),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(contribution_id,environment_id,workspace_id,customer_id) REFERENCES knowledge_contributions(id,environment_id,workspace_id,customer_id),
  FOREIGN KEY(revision_id,contribution_id) REFERENCES knowledge_revisions(id,contribution_id),
  FOREIGN KEY(reviewer_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE INDEX learning_review_candidate ON learning_candidate_reviews(revision_id,created_at DESC,id DESC);
 CREATE FUNCTION turas_learning_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
    JOIN knowledge_revisions r ON r.id=NEW.revision_id JOIN knowledge_contributions c ON c.id=r.contribution_id
    WHERE m.id=NEW.reviewer_membership_id AND m.workspace_id=NEW.workspace_id AND m.kind='internal' AND m.role='admin'
      AND m.active AND p.active AND w.active AND m.revision+1=NEW.reviewer_generation
      AND r.contribution_id=NEW.contribution_id AND r.revision_number=NEW.revision_number AND r.content_digest=NEW.content_digest
      AND c.environment_id=NEW.environment_id AND c.workspace_id=NEW.workspace_id AND c.customer_id=NEW.customer_id)
  THEN RAISE EXCEPTION 'Exact current administrator review required' USING ERRCODE='23514'; END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_review_guard BEFORE INSERT ON learning_candidate_reviews FOR EACH ROW EXECUTE FUNCTION turas_learning_review_guard();
 CREATE TABLE learning_review_payloads(review_id uuid PRIMARY KEY REFERENCES learning_candidate_reviews(id),
  content json NOT NULL CHECK(octet_length(content::text)<=16384 AND coalesce(json_typeof(content->'rationale')='string',false) AND length(btrim(content->>'rationale')) BETWEEN 1 AND 2000));
 CREATE TABLE learning_review_states(review_id uuid PRIMARY KEY REFERENCES learning_candidate_reviews(id),version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  revoked_at timestamptz,revoker_membership_id uuid REFERENCES memberships(id));
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_review_states FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,revoked_at,revoker_membership_id');
 CREATE TABLE learning_rollback_records(id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,contribution_id uuid NOT NULL,revision_id uuid NOT NULL UNIQUE,historical_revision_id uuid NOT NULL,actor_membership_id uuid REFERENCES memberships(id),created_at timestamptz DEFAULT clock_timestamp(),minimized boolean NOT NULL DEFAULT false,
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),FOREIGN KEY(contribution_id,environment_id,workspace_id,customer_id) REFERENCES knowledge_contributions(id,environment_id,workspace_id,customer_id),FOREIGN KEY(revision_id,contribution_id) REFERENCES knowledge_revisions(id,contribution_id),FOREIGN KEY(historical_revision_id,contribution_id) REFERENCES knowledge_revisions(id,contribution_id),CHECK((minimized AND actor_membership_id IS NULL AND created_at IS NULL) OR(NOT minimized AND actor_membership_id IS NOT NULL AND created_at IS NOT NULL)));
 CREATE TABLE learning_rollback_payloads(rollback_id uuid PRIMARY KEY REFERENCES learning_rollback_records(id),content json NOT NULL CHECK(octet_length(content::text)<=16384 AND length(btrim(content->>'rationale')) BETWEEN 1 AND 2000));
 CREATE TABLE learning_dependencies(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid,
  owner_kind text NOT NULL CHECK(owner_kind IN('review','draft','evaluation','measurement','cohort')),
  owner_id uuid NOT NULL,source_kind text NOT NULL CHECK(source_kind IN('accepted_profile','verified_research','approved_excerpt','accepted_execution','reuse_review')),
  source_revision_id uuid NOT NULL,source_generation bigint NOT NULL CHECK(source_generation BETWEEN 1 AND 9007199254740991),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),valid_until timestamptz,purge_at timestamptz,
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  UNIQUE(owner_kind,owner_id,source_kind,source_revision_id));
 CREATE INDEX learning_dependency_source ON learning_dependencies(source_kind,source_revision_id,owner_kind,owner_id);
 CREATE TABLE learning_command_receipts(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,actor_hash text NOT NULL CHECK(actor_hash ~ '^[a-f0-9]{64}$'),
  request_id uuid NOT NULL,action text NOT NULL CHECK(length(action) BETWEEN 1 AND 80),input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  hash_key_id text NOT NULL CHECK(length(hash_key_id) BETWEEN 1 AND 80),customer_id uuid,target_id uuid,
  version bigint CHECK(version BETWEEN 1 AND 9007199254740991),outcome text NOT NULL CHECK(outcome IN('committed','abandoned','retired')),
  created_at timestamptz DEFAULT clock_timestamp(),CHECK(created_at IS NOT NULL OR outcome='retired'),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),UNIQUE(environment_id,workspace_id,actor_hash,request_id));
 CREATE TABLE learning_rate_windows(environment_id text NOT NULL,workspace_id uuid NOT NULL,scope_key text NOT NULL,
  window_at timestamptz NOT NULL,count integer NOT NULL CHECK(count>=0),PRIMARY KEY(environment_id,workspace_id,scope_key,window_at),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id));
 DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['learning_feedback_revisions','learning_feedback_payloads','learning_feedback_dispositions',
  'learning_disposition_payloads','learning_feedback_links','learning_candidate_reviews','learning_review_payloads','learning_rollback_records','learning_rollback_payloads','learning_dependencies','learning_command_receipts'] LOOP
  EXECUTE format('CREATE TRIGGER learning_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_learning_immutable()',t);
 END LOOP; END $$;
`);
