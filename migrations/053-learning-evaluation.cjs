exports.up = pgm => pgm.sql(`
 CREATE TABLE learning_budget_accounts(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
  limit_micro_usd bigint NOT NULL CHECK(limit_micro_usd BETWEEN 1 AND 25000000),
  price_contract json NOT NULL CHECK(octet_length(price_contract::text)<=16384),price_digest text NOT NULL CHECK(price_digest ~ '^[a-f0-9]{64}$'),
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),state text NOT NULL DEFAULT 'open' CHECK(state IN('open','closed','blocked')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_budget_accounts FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,state');
 CREATE TABLE learning_evaluations(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
  contribution_id uuid NOT NULL,revision_id uuid NOT NULL,review_id uuid NOT NULL,budget_id uuid NOT NULL,
  baseline_revision_id uuid REFERENCES knowledge_revisions(id),baseline_publication_id uuid REFERENCES knowledge_publications(id),baseline_generation bigint CHECK(baseline_generation BETWEEN 1 AND 9007199254740991),
  catalog_digest text NOT NULL CHECK(catalog_digest ~ '^[a-f0-9]{64}$'),rubric_digest text NOT NULL CHECK(rubric_digest ~ '^[a-f0-9]{64}$'),
  closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),prompt_digest text NOT NULL CHECK(prompt_digest ~ '^[a-f0-9]{64}$'),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),model_identity text NOT NULL CHECK(length(model_identity) BETWEEN 1 AND 200),
  contract_version text NOT NULL DEFAULT 'learning-evaluation-v1' CHECK(contract_version='learning-evaluation-v1'),
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','running','awaiting_review','passed','failed','cancelled','ineligible','unconfirmed')),
  deadline_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),invalidated_at timestamptz,
  CHECK(deadline_at<=created_at+interval '40 minutes'),CHECK((baseline_revision_id IS NULL)=(baseline_generation IS NULL)),CHECK((baseline_publication_id IS NULL)=(baseline_generation IS NULL)),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(contribution_id,environment_id,workspace_id,customer_id) REFERENCES knowledge_contributions(id,environment_id,workspace_id,customer_id),
  FOREIGN KEY(revision_id,contribution_id) REFERENCES knowledge_revisions(id,contribution_id),
  FOREIGN KEY(review_id,environment_id,workspace_id) REFERENCES learning_candidate_reviews(id,environment_id,workspace_id),
  FOREIGN KEY(budget_id,environment_id,workspace_id) REFERENCES learning_budget_accounts(id,environment_id,workspace_id),
  FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id));
 CREATE FUNCTION turas_learning_evaluation_admission() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE head knowledge_publications%ROWTYPE; BEGIN
  IF NOT EXISTS(SELECT 1 FROM learning_candidate_reviews r JOIN learning_review_states rs ON rs.review_id=r.id
    JOIN memberships m ON m.id=NEW.actor_membership_id AND m.workspace_id=NEW.workspace_id JOIN principals p ON p.id=m.principal_id
    JOIN learning_budget_accounts b ON b.id=NEW.budget_id JOIN learning_workspace_state w ON w.environment_id=NEW.environment_id AND w.workspace_id=NEW.workspace_id
    WHERE r.id=NEW.review_id AND r.environment_id=NEW.environment_id AND r.workspace_id=NEW.workspace_id AND r.customer_id=NEW.customer_id
      AND r.contribution_id=NEW.contribution_id AND r.revision_id=NEW.revision_id AND r.closure_digest=NEW.closure_digest
      AND r.decision='accept' AND rs.revoked_at IS NULL AND NOT r.minimized AND r.id=(SELECT id FROM learning_candidate_reviews WHERE revision_id=r.revision_id AND NOT minimized ORDER BY created_at DESC,id DESC LIMIT 1) AND m.active AND p.active AND m.kind='internal' AND m.role='admin'
      AND b.environment_id=NEW.environment_id AND b.workspace_id=NEW.workspace_id AND b.actor_membership_id=NEW.actor_membership_id AND b.state='open' AND w.enabled)
  THEN RAISE EXCEPTION 'Current evaluated admission scope required' USING ERRCODE='23514'; END IF;
  SELECT * INTO head FROM knowledge_publications WHERE contribution_id=NEW.contribution_id AND environment_id=NEW.environment_id AND state='published' FOR SHARE;
  IF FOUND THEN
   IF (head.id,head.revision_id,head.head_generation) IS DISTINCT FROM(NEW.baseline_publication_id,NEW.baseline_revision_id,NEW.baseline_generation)
    THEN RAISE EXCEPTION 'Exact current baseline required' USING ERRCODE='23514'; END IF;
  ELSIF NEW.baseline_generation IS NOT NULL THEN RAISE EXCEPTION 'No eligible baseline exists' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER learning_evaluation_admission BEFORE INSERT ON learning_evaluations FOR EACH ROW EXECUTE FUNCTION turas_learning_evaluation_admission();
 CREATE UNIQUE INDEX learning_evaluation_active_workspace ON learning_evaluations(environment_id,workspace_id) WHERE state IN('prepared','running','unconfirmed');
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_evaluations FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,state,invalidated_at');
 CREATE TABLE learning_evaluation_cases(
  evaluation_id uuid NOT NULL REFERENCES learning_evaluations(id),case_id text NOT NULL CHECK(length(case_id) BETWEEN 1 AND 80),ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 8),
  fixture_digest text NOT NULL CHECK(fixture_digest ~ '^[a-f0-9]{64}$'),PRIMARY KEY(evaluation_id,case_id),UNIQUE(evaluation_id,ordinal));
 CREATE TABLE learning_evaluation_payloads(evaluation_id uuid PRIMARY KEY REFERENCES learning_evaluations(id),content json NOT NULL CHECK(octet_length(content::text)<=131072),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'));
 CREATE TABLE learning_bindings(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,actor_membership_id uuid NOT NULL,
  conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id),purpose text NOT NULL CHECK(purpose IN('draft','evaluation_baseline','evaluation_candidate')),
  evaluation_id uuid,case_id text,closure_digest text NOT NULL CHECK(closure_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK((purpose='draft')=(evaluation_id IS NULL AND case_id IS NULL)),
  FOREIGN KEY(evaluation_id,case_id) REFERENCES learning_evaluation_cases(evaluation_id,case_id),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id),
  UNIQUE(id,conversation_id,actor_membership_id),UNIQUE(evaluation_id,case_id,purpose));
 CREATE TABLE learning_attempts(
  id uuid PRIMARY KEY,binding_id uuid NOT NULL UNIQUE,environment_id text NOT NULL,workspace_id uuid NOT NULL,customer_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,conversation_id uuid NOT NULL UNIQUE,purpose text NOT NULL CHECK(purpose IN('draft','evaluation_baseline','evaluation_candidate')),
  budget_id uuid NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  state text NOT NULL DEFAULT 'prepared' CHECK(state IN('prepared','admitted','running','completed','failed','cancelled','unconfirmed','invalidated')),
  response_attempt_id uuid UNIQUE REFERENCES response_attempts(id),native_request_id uuid,native_session_id text,native_turn_id text,
  context_bytes integer NOT NULL DEFAULT 0 CHECK(context_bytes BETWEEN 0 AND 24576),model_steps integer NOT NULL DEFAULT 0 CHECK(model_steps BETWEEN 0 AND 6),
  read_calls integer NOT NULL DEFAULT 0 CHECK(read_calls BETWEEN 0 AND 6),output_tokens bigint NOT NULL DEFAULT 0 CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
  prepared_until timestamptz NOT NULL,dispatch_at timestamptz,deadline_at timestamptz,settled_at timestamptz,
  output_digest text CHECK(output_digest ~ '^[a-f0-9]{64}$'),failure_code text CHECK(failure_code ~ '^[a-z][a-z0-9_]{0,79}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK(prepared_until<=created_at+interval '5 minutes'),CHECK(deadline_at IS NULL OR deadline_at<=dispatch_at+interval '120 seconds'),
  CHECK(purpose='draft' OR(model_steps<=1 AND read_calls=0)),
  FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES learning_bindings(id,environment_id,workspace_id),
  FOREIGN KEY(binding_id,conversation_id,actor_membership_id) REFERENCES learning_bindings(id,conversation_id,actor_membership_id),
  FOREIGN KEY(budget_id,environment_id,workspace_id) REFERENCES learning_budget_accounts(id,environment_id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),UNIQUE(id,environment_id,workspace_id),UNIQUE(id,output_digest));
 CREATE FUNCTION turas_learning_attempt_scope() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE evaluation_row learning_evaluations%ROWTYPE; prior_count integer; ordinal_count integer; BEGIN
  IF NOT EXISTS(SELECT 1 FROM learning_bindings l JOIN learning_budget_accounts b ON b.id=NEW.budget_id
    WHERE l.id=NEW.binding_id AND (l.environment_id,l.workspace_id,l.customer_id,l.actor_membership_id,l.conversation_id,l.purpose)
      =(NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.actor_membership_id,NEW.conversation_id,NEW.purpose)
      AND (b.environment_id,b.workspace_id,b.actor_membership_id)=(NEW.environment_id,NEW.workspace_id,NEW.actor_membership_id))
  THEN RAISE EXCEPTION 'Exact learning attempt scope required' USING ERRCODE='23514'; END IF;
  IF NEW.purpose<>'draft' THEN
   SELECT e.* INTO evaluation_row FROM learning_evaluations e JOIN learning_bindings b ON b.evaluation_id=e.id WHERE b.id=NEW.binding_id FOR UPDATE OF e;
   SELECT count(*) INTO prior_count FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=evaluation_row.id;
   SELECT c.ordinal INTO ordinal_count FROM learning_evaluation_cases c JOIN learning_bindings b ON b.evaluation_id=c.evaluation_id AND b.case_id=c.case_id WHERE b.id=NEW.binding_id;
   IF evaluation_row.state NOT IN('prepared','running') OR evaluation_row.deadline_at<=clock_timestamp() OR prior_count>=16 OR ordinal_count<>prior_count/2+1
    OR NEW.purpose<>(CASE WHEN prior_count%2=0 THEN 'evaluation_baseline' ELSE 'evaluation_candidate' END)
    OR EXISTS(SELECT 1 FROM learning_attempts a JOIN learning_bindings b ON b.id=a.binding_id WHERE b.evaluation_id=evaluation_row.id AND (a.state<>'completed' OR a.output_digest IS NULL))
    THEN RAISE EXCEPTION 'One ordered evaluation arm at a time required' USING ERRCODE='23514'; END IF;
  END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_attempt_scope BEFORE INSERT ON learning_attempts FOR EACH ROW EXECUTE FUNCTION turas_learning_attempt_scope();
 CREATE UNIQUE INDEX learning_draft_active_owner ON learning_attempts(environment_id,workspace_id,actor_membership_id,customer_id)
  WHERE purpose='draft' AND state IN('prepared','admitted','running','unconfirmed');
 CREATE TRIGGER learning_identity BEFORE UPDATE OR DELETE ON learning_attempts FOR EACH ROW EXECUTE FUNCTION turas_learning_identity('version,state,response_attempt_id,native_request_id,native_session_id,native_turn_id,context_bytes,model_steps,read_calls,output_tokens,dispatch_at,deadline_at,settled_at,output_digest,failure_code');
 CREATE TABLE learning_attempt_payloads(attempt_id uuid NOT NULL REFERENCES learning_attempts(id),kind text NOT NULL CHECK(kind IN('context','question','source_map','instruction','output')),
  content json NOT NULL CHECK(octet_length(content::text)<=65536),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),PRIMARY KEY(attempt_id,kind));
 CREATE TABLE learning_read_receipts(attempt_id uuid NOT NULL REFERENCES learning_attempts(id),call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 200),
  tool_name text NOT NULL CHECK(tool_name IN('learning_summary','learning_evidence','load_skill')),input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  output_digest text NOT NULL CHECK(output_digest ~ '^[a-f0-9]{64}$'),bytes integer NOT NULL CHECK(bytes BETWEEN 0 AND 24576),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(attempt_id,call_id));
 CREATE TABLE learning_native_event_receipts(native_event_id text PRIMARY KEY CHECK(char_length(native_event_id) BETWEEN 1 AND 200),
  attempt_id uuid NOT NULL,environment_id text NOT NULL,workspace_id uuid NOT NULL,
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
  FOREIGN KEY(attempt_id,environment_id,workspace_id) REFERENCES learning_attempts(id,environment_id,workspace_id));
 CREATE TABLE learning_budget_reservations(
  id uuid PRIMARY KEY,budget_id uuid NOT NULL REFERENCES learning_budget_accounts(id),attempt_id uuid NOT NULL REFERENCES learning_attempts(id),
  ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6),native_session_id text NOT NULL,native_turn_id text NOT NULL,
  ceiling_micro_usd bigint NOT NULL CHECK(ceiling_micro_usd>0),input_ceiling bigint NOT NULL CHECK(input_ceiling>=0),output_ceiling bigint NOT NULL CHECK(output_ceiling>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(attempt_id,ordinal),UNIQUE(attempt_id,native_session_id,native_turn_id,ordinal));
 CREATE TABLE learning_budget_settlements(
  id uuid PRIMARY KEY,reservation_id uuid NOT NULL UNIQUE REFERENCES learning_budget_reservations(id),kind text NOT NULL CHECK(kind IN('actual','conservative_bound')),
  amount_micro_usd bigint NOT NULL CHECK(amount_micro_usd>=0),input_tokens bigint NOT NULL CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
  output_tokens bigint NOT NULL CHECK(output_tokens BETWEEN 0 AND 9007199254740991),provider_generation_id text,
  actor_membership_id uuid REFERENCES memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE learning_settlement_payloads(settlement_id uuid PRIMARY KEY REFERENCES learning_budget_settlements(id),content json NOT NULL CHECK(octet_length(content::text)<=16384));
 CREATE TABLE learning_model_dispatches(reservation_id uuid PRIMARY KEY REFERENCES learning_budget_reservations(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE learning_reservation_releases(reservation_id uuid PRIMARY KEY REFERENCES learning_budget_reservations(id),reason text NOT NULL CHECK(reason='terminal_without_dispatch'),created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TRIGGER learning_immutable BEFORE UPDATE OR DELETE ON learning_reservation_releases FOR EACH ROW EXECUTE FUNCTION turas_learning_immutable();
 CREATE FUNCTION turas_learning_unused_release_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  PERFORM 1 FROM learning_budget_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM learning_model_dispatches WHERE reservation_id=NEW.reservation_id) OR EXISTS(SELECT 1 FROM learning_budget_settlements WHERE reservation_id=NEW.reservation_id)
   OR NOT EXISTS(SELECT 1 FROM learning_budget_reservations r JOIN learning_attempts a ON a.id=r.attempt_id WHERE r.id=NEW.reservation_id AND a.state IN('completed','failed','cancelled','unconfirmed','invalidated'))
  THEN RAISE EXCEPTION 'Only a terminal undispatched reservation can be released' USING ERRCODE='23514'; END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER learning_unused_release_guard BEFORE INSERT ON learning_reservation_releases FOR EACH ROW EXECUTE FUNCTION turas_learning_unused_release_guard();
 CREATE FUNCTION turas_learning_dispatch_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM learning_budget_reservations r JOIN learning_budget_accounts b ON b.id=r.budget_id
    JOIN learning_attempts a ON a.id=r.attempt_id JOIN learning_workspace_state w ON w.environment_id=a.environment_id AND w.workspace_id=a.workspace_id
    JOIN memberships m ON m.id=a.actor_membership_id AND m.workspace_id=a.workspace_id JOIN principals p ON p.id=m.principal_id
    JOIN conversations c ON c.id=a.conversation_id JOIN login_sessions l ON l.id=c.context_login_session_id AND l.principal_id=m.principal_id
    WHERE r.id=NEW.reservation_id AND b.state='open' AND a.state IN('admitted','running') AND a.deadline_at>clock_timestamp()
      AND w.enabled AND m.active AND m.kind='internal' AND p.active AND l.revoked_at IS NULL AND l.expires_at>clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM learning_budget_settlements s WHERE s.reservation_id=r.id) AND NOT EXISTS(SELECT 1 FROM learning_reservation_releases released WHERE released.reservation_id=r.id))
  THEN RAISE EXCEPTION 'Learning dispatch is not admissible' USING ERRCODE='23514'; END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER learning_dispatch_guard BEFORE INSERT ON learning_model_dispatches FOR EACH ROW EXECUTE FUNCTION turas_learning_dispatch_guard();
 CREATE FUNCTION turas_learning_reservation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE b learning_budget_accounts%ROWTYPE; a learning_attempts%ROWTYPE; spent numeric;
 BEGIN
  SELECT * INTO b FROM learning_budget_accounts WHERE id=NEW.budget_id FOR UPDATE;
  SELECT * INTO a FROM learning_attempts WHERE id=NEW.attempt_id FOR UPDATE;
  IF b.id IS NULL OR a.id IS NULL OR a.budget_id<>b.id
   OR (a.environment_id,a.workspace_id,a.actor_membership_id) IS DISTINCT FROM(b.environment_id,b.workspace_id,b.actor_membership_id)
   OR b.state<>'open' OR a.state NOT IN('admitted','running') OR a.deadline_at IS NULL OR a.deadline_at<=clock_timestamp()
   OR NEW.ordinal<>a.model_steps+1 OR (a.purpose<>'draft' AND NEW.ordinal<>1)
  THEN RAISE EXCEPTION 'Learning reservation is not admissible' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM learning_budget_reservations r LEFT JOIN learning_budget_settlements s ON s.reservation_id=r.id
    WHERE r.budget_id=b.id AND s.id IS NULL AND NOT EXISTS(SELECT 1 FROM learning_reservation_releases released WHERE released.reservation_id=r.id))
  THEN RAISE EXCEPTION 'Unsettled learning cost blocks admission' USING ERRCODE='23514'; END IF;
  SELECT coalesce(sum(s.amount_micro_usd),0) INTO spent FROM learning_budget_reservations r
    JOIN learning_budget_settlements s ON s.reservation_id=r.id WHERE r.budget_id=b.id;
  IF spent+NEW.ceiling_micro_usd>b.limit_micro_usd THEN
    RAISE EXCEPTION 'Learning budget exhausted' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT 1 FROM learning_workspace_state w WHERE w.environment_id=b.environment_id AND w.workspace_id=b.workspace_id AND w.enabled)
  THEN RAISE EXCEPTION 'Learning admission disabled' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER learning_reservation_guard BEFORE INSERT ON learning_budget_reservations FOR EACH ROW EXECUTE FUNCTION turas_learning_reservation_guard();
 CREATE FUNCTION turas_learning_settlement_guard() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE r learning_budget_reservations%ROWTYPE; BEGIN
  SELECT * INTO r FROM learning_budget_reservations WHERE id=NEW.reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation missing' USING ERRCODE='23503'; END IF;
  IF EXISTS(SELECT 1 FROM learning_reservation_releases WHERE reservation_id=NEW.reservation_id) THEN RAISE EXCEPTION 'Undispatched reservation was released' USING ERRCODE='23514';END IF;
  PERFORM 1 FROM learning_budget_accounts WHERE id=r.budget_id FOR UPDATE;
  IF NEW.kind='conservative_bound' AND (NEW.amount_micro_usd<r.ceiling_micro_usd OR NEW.actor_membership_id IS NULL)
  THEN RAISE EXCEPTION 'Conservative settlement requires reviewed upper bound' USING ERRCODE='23514'; END IF;
  IF NEW.kind='actual' AND coalesce(length(NEW.provider_generation_id),0)=0
  THEN RAISE EXCEPTION 'Actual settlement requires provider identity' USING ERRCODE='23514'; END IF;
  IF NEW.amount_micro_usd>r.ceiling_micro_usd OR NEW.input_tokens>r.input_ceiling OR NEW.output_tokens>r.output_ceiling THEN
    UPDATE learning_budget_accounts SET state='blocked',version=version+1 WHERE id=r.budget_id;
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER learning_settlement_guard BEFORE INSERT ON learning_budget_settlements FOR EACH ROW EXECUTE FUNCTION turas_learning_settlement_guard();
 CREATE TABLE learning_case_reviews(
  id uuid PRIMARY KEY,evaluation_id uuid NOT NULL,case_id text NOT NULL,actor_membership_id uuid NOT NULL REFERENCES memberships(id),
  actor_generation bigint NOT NULL CHECK(actor_generation BETWEEN 1 AND 9007199254740991),baseline_capture_digest text NOT NULL CHECK(baseline_capture_digest ~ '^[a-f0-9]{64}$'),
  candidate_capture_digest text NOT NULL CHECK(candidate_capture_digest ~ '^[a-f0-9]{64}$'),baseline_score integer NOT NULL CHECK(baseline_score BETWEEN 0 AND 8),
  candidate_score integer NOT NULL CHECK(candidate_score BETWEEN 0 AND 8),safety_passed boolean NOT NULL,citation_passed boolean NOT NULL,authority_passed boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),FOREIGN KEY(evaluation_id,case_id) REFERENCES learning_evaluation_cases(evaluation_id,case_id),UNIQUE(evaluation_id,case_id));
 CREATE TABLE learning_case_review_payloads(review_id uuid PRIMARY KEY REFERENCES learning_case_reviews(id),content json NOT NULL CHECK(octet_length(content::text)<=16384));
 CREATE FUNCTION turas_learning_verdict_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NEW.state='passed' AND (TG_OP='INSERT' OR OLD.state IS DISTINCT FROM NEW.state) THEN
   IF TG_OP='INSERT' OR OLD.state<>'awaiting_review' THEN RAISE EXCEPTION 'A failed or incomplete evaluation cannot become passed' USING ERRCODE='23514'; END IF;
   IF NEW.invalidated_at IS NOT NULL OR NOT EXISTS(SELECT 1 FROM learning_candidate_reviews r JOIN learning_review_states rs ON rs.review_id=r.id
    WHERE r.id=NEW.review_id AND r.revision_id=NEW.revision_id AND r.closure_digest=NEW.closure_digest AND r.decision='accept' AND rs.revoked_at IS NULL)
    OR (SELECT count(*) FROM learning_evaluation_cases WHERE evaluation_id=NEW.id)<>8
    OR (SELECT count(*) FROM learning_case_reviews WHERE evaluation_id=NEW.id AND safety_passed AND citation_passed AND authority_passed
      AND candidate_score>=7 AND candidate_score>=baseline_score)<>8
    OR NOT EXISTS(SELECT 1 FROM learning_case_reviews WHERE evaluation_id=NEW.id AND candidate_score>baseline_score)
    OR EXISTS(SELECT 1 FROM learning_case_reviews r LEFT JOIN memberships m ON m.id=r.actor_membership_id AND m.workspace_id=NEW.workspace_id
      LEFT JOIN principals p ON p.id=m.principal_id WHERE r.evaluation_id=NEW.id
      AND (m.id IS NULL OR NOT m.active OR NOT p.active OR m.kind<>'internal' OR m.role<>'admin' OR m.revision+1<>r.actor_generation))
    OR (SELECT count(*) FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id
      JOIN learning_budget_reservations r ON r.attempt_id=a.id JOIN learning_model_dispatches d ON d.reservation_id=r.id
      JOIN learning_budget_settlements s ON s.reservation_id=r.id WHERE b.evaluation_id=NEW.id)<>16
    OR (SELECT count(*) FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id
      WHERE b.evaluation_id=NEW.id AND a.state='completed' AND a.output_digest IS NOT NULL)<>16
    OR EXISTS(SELECT 1 FROM learning_bindings b JOIN learning_attempts a ON a.binding_id=b.id JOIN learning_case_reviews r
      ON r.evaluation_id=b.evaluation_id AND r.case_id=b.case_id WHERE b.evaluation_id=NEW.id
      AND a.output_digest IS DISTINCT FROM CASE b.purpose WHEN 'evaluation_baseline' THEN r.baseline_capture_digest ELSE r.candidate_capture_digest END)
   THEN RAISE EXCEPTION 'Complete reviewed paired evaluation required' USING ERRCODE='23514'; END IF;
  END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_verdict_guard BEFORE INSERT OR UPDATE ON learning_evaluations FOR EACH ROW EXECUTE FUNCTION turas_learning_verdict_guard();
 CREATE TABLE learning_release_decisions(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL,evaluation_id uuid NOT NULL,review_id uuid NOT NULL,
  contribution_id uuid NOT NULL,revision_id uuid NOT NULL,publication_id uuid NOT NULL,publication_generation bigint NOT NULL CHECK(publication_generation BETWEEN 1 AND 9007199254740991),
  actor_membership_id uuid NOT NULL,rollback_from_revision_id uuid REFERENCES knowledge_revisions(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),
  FOREIGN KEY(evaluation_id,environment_id,workspace_id) REFERENCES learning_evaluations(id,environment_id,workspace_id),
  FOREIGN KEY(review_id,environment_id,workspace_id) REFERENCES learning_candidate_reviews(id,environment_id,workspace_id),
  FOREIGN KEY(revision_id,contribution_id) REFERENCES knowledge_revisions(id,contribution_id),
  FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(publication_id,publication_generation));
 CREATE TABLE learning_legacy_heads(environment_id text NOT NULL,workspace_id uuid NOT NULL,publication_id uuid NOT NULL REFERENCES knowledge_publications(id),revision_id uuid NOT NULL REFERENCES knowledge_revisions(id),
  publication_generation bigint NOT NULL CHECK(publication_generation BETWEEN 1 AND 9007199254740991),captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(environment_id,workspace_id) REFERENCES learning_workspace_state(environment_id,workspace_id),PRIMARY KEY(publication_id,publication_generation));
 CREATE FUNCTION turas_learning_publication_gate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='UPDATE' AND NEW.state='published' AND (NEW.revision_id,NEW.head_generation,NEW.state) IS DISTINCT FROM(OLD.revision_id,OLD.head_generation,OLD.state)
    AND EXISTS(SELECT 1 FROM learning_workspace_state s JOIN knowledge_contributions c ON c.workspace_id=s.workspace_id AND c.environment_id=s.environment_id WHERE c.id=NEW.contribution_id AND s.gate_activated_at IS NOT NULL)
    AND NEW.head_generation<>OLD.head_generation+1 THEN RAISE EXCEPTION 'A publication requires a new monotone generation' USING ERRCODE='23514'; END IF;
  IF NEW.state='published' AND(TG_OP='INSERT' OR (NEW.revision_id,NEW.head_generation,NEW.state) IS DISTINCT FROM (OLD.revision_id,OLD.head_generation,OLD.state))
   AND EXISTS(SELECT 1 FROM learning_workspace_state s JOIN knowledge_contributions c ON c.workspace_id=s.workspace_id AND c.environment_id=s.environment_id
    WHERE c.id=NEW.contribution_id AND s.gate_activated_at IS NOT NULL)
   AND NOT EXISTS(SELECT 1 FROM learning_release_decisions d JOIN learning_evaluations e ON e.id=d.evaluation_id JOIN learning_candidate_reviews r ON r.id=d.review_id
    JOIN learning_review_states rs ON rs.review_id=r.id JOIN learning_workspace_state s ON s.environment_id=d.environment_id AND s.workspace_id=d.workspace_id
    WHERE(d.publication_id,d.publication_generation,d.revision_id,d.contribution_id)=(NEW.id,NEW.head_generation,NEW.revision_id,NEW.contribution_id)
     AND d.environment_id=NEW.environment_id AND e.state='passed' AND e.invalidated_at IS NULL AND e.revision_id=d.revision_id AND e.review_id=d.review_id
     AND r.revision_id=d.revision_id AND r.decision='accept' AND rs.revoked_at IS NULL AND s.enabled)
  THEN RAISE EXCEPTION 'An evaluated learning release is required' USING ERRCODE='23514'; END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER learning_publication_gate BEFORE INSERT OR UPDATE ON knowledge_publications FOR EACH ROW EXECUTE FUNCTION turas_learning_publication_gate();
 CREATE FUNCTION turas_learning_binding_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c conversations%ROWTYPE; BEGIN
  SELECT * INTO c FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conversation missing' USING ERRCODE='23503'; END IF;
  IF TG_TABLE_NAME<>'learning_bindings' THEN
   IF EXISTS(SELECT 1 FROM learning_bindings WHERE conversation_id=c.id) THEN RAISE EXCEPTION 'Learning conversation is exclusive' USING ERRCODE='23514'; END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM planning_conversation_bindings WHERE conversation_id=c.id) OR EXISTS(SELECT 1 FROM staffing_conversation_bindings WHERE conversation_id=c.id)
    OR EXISTS(SELECT 1 FROM execution_advice_bindings WHERE conversation_id=c.id) OR EXISTS(SELECT 1 FROM support_advice_bindings WHERE conversation_id=c.id)
    OR EXISTS(SELECT 1 FROM expansion_advice_bindings WHERE conversation_id=c.id) OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=c.id)
    OR EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=c.id) OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=c.id) OR EXISTS(SELECT 1 FROM event_projections WHERE conversation_id=c.id)
   THEN RAISE EXCEPTION 'Learning requires a fresh exclusive conversation' USING ERRCODE='23514'; END IF;
   IF(c.environment_id,c.workspace_id,c.context_membership_id,c.customer_id) IS DISTINCT FROM(NEW.environment_id,NEW.workspace_id,NEW.actor_membership_id,NEW.customer_id)
    THEN RAISE EXCEPTION 'Learning binding scope mismatch' USING ERRCODE='23514'; END IF;
   IF NEW.purpose<>'draft' AND NOT EXISTS(SELECT 1 FROM learning_evaluations e WHERE e.id=NEW.evaluation_id
      AND (e.environment_id,e.workspace_id,e.customer_id,e.actor_membership_id,e.closure_digest)
       =(NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.actor_membership_id,NEW.closure_digest))
   THEN RAISE EXCEPTION 'Exact learning evaluation scope required' USING ERRCODE='23514'; END IF;
   IF c.context_snapshot_schema<>'customer-context-v1' OR c.context_audience<>'internal'
    OR NOT EXISTS(SELECT 1 FROM memberships m JOIN principals p ON p.id=m.principal_id JOIN workspaces w ON w.id=m.workspace_id
      JOIN login_sessions l ON l.id=c.context_login_session_id AND l.principal_id=m.principal_id
      WHERE m.id=NEW.actor_membership_id AND m.workspace_id=NEW.workspace_id AND m.kind='internal'
        AND m.active AND p.active AND w.active AND c.owner_principal_id=m.principal_id AND l.revoked_at IS NULL AND l.expires_at>clock_timestamp())
   THEN RAISE EXCEPTION 'Current internal owner context required' USING ERRCODE='23514'; END IF;
  END IF; RETURN NEW;
 END $$;
 CREATE FUNCTION turas_learning_conversation_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF EXISTS(SELECT 1 FROM learning_bindings WHERE conversation_id=OLD.id)
    AND (NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.owner_principal_id,NEW.context_membership_id,NEW.context_login_session_id,NEW.context_snapshot_schema,NEW.context_audience,NEW.context_generation)
      IS DISTINCT FROM(OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.owner_principal_id,OLD.context_membership_id,OLD.context_login_session_id,OLD.context_snapshot_schema,OLD.context_audience,OLD.context_generation)
  THEN RAISE EXCEPTION 'Learning conversation context is immutable' USING ERRCODE='23514'; END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER learning_conversation_identity BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION turas_learning_conversation_identity();
 DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['learning_bindings','planning_conversation_bindings','staffing_conversation_bindings','execution_advice_bindings','support_advice_bindings','expansion_advice_bindings','research_requests'] LOOP
  EXECUTE format('CREATE TRIGGER learning_binding_exclusive BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION turas_learning_binding_exclusive()',t);END LOOP;
  FOREACH t IN ARRAY ARRAY['learning_bindings','learning_evaluation_cases','learning_evaluation_payloads','learning_attempt_payloads','learning_read_receipts','learning_native_event_receipts','learning_budget_reservations','learning_budget_settlements','learning_settlement_payloads','learning_model_dispatches','learning_case_reviews','learning_case_review_payloads','learning_release_decisions','learning_legacy_heads'] LOOP
  EXECUTE format('CREATE TRIGGER learning_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_learning_immutable()',t);END LOOP;
 END $$;
`);
