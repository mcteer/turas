exports.up = pgm => {
  pgm.sql(`
    CREATE FUNCTION turas_expansion_distinct_ids(ids uuid[]) RETURNS boolean
    LANGUAGE sql IMMUTABLE STRICT AS $$
      SELECT cardinality(ids)=count(DISTINCT value) AND count(value)=cardinality(ids) FROM unnest(ids) value
    $$;
    CREATE TABLE expansion_advice_bindings (
      id uuid PRIMARY KEY, scope_id uuid NOT NULL, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, customer_id uuid NOT NULL, workload_id uuid,
      audience text NOT NULL CHECK(audience='internal'),
      conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id), owner_membership_id uuid NOT NULL,
      selected_engagement_ids uuid[] NOT NULL CHECK(cardinality(selected_engagement_ids)<=10 AND turas_expansion_distinct_ids(selected_engagement_ids)),
      selected_hypothesis_ids uuid[] NOT NULL CHECK(cardinality(selected_hypothesis_ids)<=20 AND turas_expansion_distinct_ids(selected_hypothesis_ids)),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,environment_id,workspace_id), UNIQUE(id,conversation_id,owner_membership_id),
      FOREIGN KEY(scope_id,environment_id,workspace_id,customer_id) REFERENCES expansion_scopes(id,environment_id,workspace_id,customer_id),
      UNIQUE(id,scope_id),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE expansion_advice_attempts (
      id uuid PRIMARY KEY, binding_id uuid NOT NULL UNIQUE, scope_id uuid NOT NULL REFERENCES expansion_scopes(id), environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id), owner_membership_id uuid NOT NULL,
      request_key uuid NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      response_attempt_id uuid UNIQUE REFERENCES response_attempts(id), native_request_id uuid, native_session_id text,
      response_id text, native_turn_id text,
      state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','running','completed','failed','cancelled','expired','unconfirmed')),
      model_steps integer NOT NULL DEFAULT 0 CHECK(model_steps BETWEEN 0 AND 6),
      read_calls integer NOT NULL DEFAULT 0 CHECK(read_calls BETWEEN 0 AND 6),
      context_bytes integer NOT NULL DEFAULT 0 CHECK(context_bytes BETWEEN 0 AND 24576),
      dependency_count integer NOT NULL DEFAULT 0 CHECK(dependency_count BETWEEN 0 AND 200),
      dispatch_at timestamptz, deadline_at timestamptz, settled_at timestamptz,
      failure_code text CHECK(failure_code ~ '^[a-z][a-z0-9_]{0,79}$'),
      output_digest text CHECK(output_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(environment_id,workspace_id,owner_membership_id,request_key), UNIQUE(id,scope_id), UNIQUE(id,output_digest), UNIQUE(id,owner_membership_id),
      FOREIGN KEY(binding_id,scope_id) REFERENCES expansion_advice_bindings(id,scope_id),
      FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES expansion_advice_bindings(id,environment_id,workspace_id),
      FOREIGN KEY(binding_id,conversation_id,owner_membership_id) REFERENCES expansion_advice_bindings(id,conversation_id,owner_membership_id)
    );
    CREATE UNIQUE INDEX expansion_advice_active_owner_scope ON expansion_advice_attempts(environment_id,workspace_id,owner_membership_id,scope_id)
      WHERE state IN ('prepared','running','unconfirmed');
    CREATE INDEX expansion_advice_admission_window ON expansion_advice_attempts(environment_id,workspace_id,owner_membership_id,dispatch_at);
    CREATE INDEX expansion_advice_pending ON expansion_advice_attempts(state,deadline_at);
    CREATE TABLE expansion_advice_revision_refs (
      attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id), revision_id uuid NOT NULL REFERENCES expansion_revisions(id),
      PRIMARY KEY(attempt_id,revision_id)
    );

    ALTER TABLE expansion_revisions ADD COLUMN advice_attempt_id uuid,
      ADD COLUMN advice_output_digest text CHECK(advice_output_digest ~ '^[a-f0-9]{64}$'),
      ADD COLUMN advice_suggestion_index integer CHECK(advice_suggestion_index BETWEEN 0 AND 4),
      ADD FOREIGN KEY(advice_attempt_id,scope_id) REFERENCES expansion_advice_attempts(id,scope_id),
      ADD FOREIGN KEY(advice_attempt_id,advice_output_digest) REFERENCES expansion_advice_attempts(id,output_digest),
      ADD FOREIGN KEY(advice_attempt_id,author_membership_id) REFERENCES expansion_advice_attempts(id,owner_membership_id),
      ADD CHECK((advice_attempt_id IS NULL AND advice_output_digest IS NULL AND advice_suggestion_index IS NULL)
        OR (advice_attempt_id IS NOT NULL AND advice_output_digest IS NOT NULL AND advice_suggestion_index IS NOT NULL));
    CREATE TABLE expansion_advice_dependencies (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id),
      kind text NOT NULL CHECK(kind IN ('accepted_profile','approved_excerpt','verified_research','shared_knowledge',
        'execution_record','milestone_baseline','expansion_head','expansion_scope','account_owner','profile_collection','shared_collection','execution_collection')),
      dependency_id uuid NOT NULL, revision_id uuid, generation bigint NOT NULL CHECK(generation>=0 AND generation<=9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      UNIQUE(attempt_id,kind,dependency_id)
    );
    CREATE INDEX expansion_advice_reverse_sources ON expansion_advice_dependencies(kind,dependency_id,revision_id);
    CREATE TABLE expansion_advice_retirements (
      attempt_id uuid PRIMARY KEY REFERENCES expansion_advice_attempts(id), retired_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE expansion_advice_payloads (
      attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id),
      kind text NOT NULL CHECK(kind IN ('instruction','context','source_map','output','question')),
      content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536), PRIMARY KEY(attempt_id,kind)
    );
    CREATE TABLE expansion_advice_reads (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id),
      call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 200),
      tool_name text NOT NULL CHECK(tool_name IN ('expansion_summary','expansion_hypotheses','expansion_evidence','load_skill')),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6),
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      context_bytes integer NOT NULL CHECK(context_bytes BETWEEN 0 AND 24576),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,call_id), UNIQUE(attempt_id,ordinal)
    );
    CREATE TABLE expansion_advice_read_payloads (
      receipt_id uuid PRIMARY KEY REFERENCES expansion_advice_reads(id),
      payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536)
    );
    CREATE TABLE expansion_model_step_receipts (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES expansion_advice_attempts(id),
      native_session_id text NOT NULL, response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),
      native_turn_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6),
      step_token text NOT NULL CHECK(length(step_token) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,step_token)
    );
    CREATE TABLE expansion_advice_usage (
      step_id uuid PRIMARY KEY REFERENCES expansion_model_step_receipts(id), native_event_id text UNIQUE,
      outcome text NOT NULL CHECK(outcome IN ('confirmed','unknown','failed','cancelled')),
      input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE expansion_advice_cleanup_jobs (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE REFERENCES expansion_advice_attempts(id),
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'), due_at timestamptz NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done')),
      lease_token uuid, lease_until timestamptz, completed_at timestamptz,
      CHECK((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
    );
    CREATE INDEX expansion_advice_cleanup_due ON expansion_advice_cleanup_jobs(state,due_at);
    CREATE TABLE expansion_native_retirement_receipts (
      attempt_id uuid PRIMARY KEY REFERENCES expansion_advice_attempts(id),
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
      next_attempt_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    );
    CREATE INDEX expansion_native_retirement_due ON expansion_native_retirement_receipts(state,next_attempt_at);
    CREATE TRIGGER expansion_attempt_identity BEFORE UPDATE OR DELETE ON expansion_advice_attempts FOR EACH ROW
      EXECUTE FUNCTION turas_execution_identity('id','binding_id','environment_id','workspace_id','scope_id','conversation_id','owner_membership_id','request_key','request_digest','created_at');
    CREATE FUNCTION turas_expansion_advice_authority_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE before_row jsonb:=to_jsonb(OLD); after_row jsonb:=to_jsonb(NEW); affected uuid;
    BEGIN
      IF TG_TABLE_NAME='memberships' AND before_row->'active'=after_row->'active' AND before_row->'kind'=after_row->'kind' AND before_row->'role'=after_row->'role' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='principals' AND before_row->'active'=after_row->'active' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='login_sessions' AND before_row->'revoked_at' IS NOT DISTINCT FROM after_row->'revoked_at' AND before_row->'expires_at'=after_row->'expires_at' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='customer_profile_state' AND before_row->'internal_generation'=after_row->'internal_generation' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='expansion_scopes' AND before_row->'generation'=after_row->'generation' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='customer_workloads' AND before_row->'display_name'=after_row->'display_name' AND before_row->'lifecycle'=after_row->'lifecycle' THEN RETURN NEW; END IF;
      IF TG_TABLE_NAME='customer_references' AND before_row->'display_name'=after_row->'display_name' THEN RETURN NEW; END IF;
      affected:=COALESCE(after_row->>'id',after_row->>'customer_id')::uuid;
      INSERT INTO expansion_advice_retirements(attempt_id)
      SELECT DISTINCT a.id FROM expansion_advice_attempts a JOIN expansion_advice_bindings b ON b.id=a.binding_id
        JOIN conversations c ON c.id=a.conversation_id LEFT JOIN expansion_account_owners owner ON owner.customer_id=b.customer_id AND owner.workspace_id=b.workspace_id
        LEFT JOIN memberships owner_member ON owner_member.id=owner.owner_membership_id
      WHERE (TG_TABLE_NAME='memberships' AND (b.owner_membership_id=affected OR owner.owner_membership_id=affected))
        OR (TG_TABLE_NAME='principals' AND (c.owner_principal_id=affected OR owner_member.principal_id=affected))
        OR (TG_TABLE_NAME='login_sessions' AND c.context_login_session_id=affected)
        OR (TG_TABLE_NAME IN ('customer_profile_state','expansion_account_owners','customer_references') AND b.customer_id=affected)
        OR (TG_TABLE_NAME='expansion_scopes' AND b.scope_id=affected)
        OR (TG_TABLE_NAME='customer_workloads' AND b.workload_id=affected)
      ON CONFLICT DO NOTHING;
      RETURN NEW;
    END $$;
    CREATE TRIGGER memberships_expansion_advice_retirement AFTER UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER principals_expansion_advice_retirement AFTER UPDATE ON principals FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER login_sessions_expansion_advice_retirement AFTER UPDATE ON login_sessions FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER customer_profile_state_expansion_advice_retirement AFTER UPDATE ON customer_profile_state FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER expansion_account_owners_expansion_advice_retirement AFTER UPDATE ON expansion_account_owners FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER expansion_scopes_expansion_advice_retirement AFTER UPDATE ON expansion_scopes FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER customer_workloads_expansion_advice_retirement AFTER UPDATE ON customer_workloads FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE TRIGGER customer_references_expansion_advice_retirement AFTER UPDATE ON customer_references FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_authority_retirement();
    CREATE FUNCTION turas_purge_expansion_advice(p_job uuid,p_lease uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE j public.expansion_advice_cleanup_jobs%ROWTYPE; a public.expansion_advice_attempts%ROWTYPE; due timestamptz;
    BEGIN
      SELECT * INTO j FROM public.expansion_advice_cleanup_jobs WHERE id=p_job FOR UPDATE;
      IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=clock_timestamp()
        OR j.due_at>clock_timestamp() THEN RETURN false; END IF;
      SELECT * INTO a FROM public.expansion_advice_attempts WHERE id=j.attempt_id FOR UPDATE;
      IF NOT FOUND OR a.request_digest<>j.request_digest OR a.environment_id IS DISTINCT FROM (SELECT environment_id FROM public.turas_environment LIMIT 1) THEN RETURN false; END IF;
      SELECT a.created_at+interval '30 days' INTO due;
      SELECT LEAST(due,retired_at+interval '24 hours') INTO due FROM public.expansion_advice_retirements WHERE attempt_id=a.id;
      IF NOT FOUND THEN due:=a.created_at+interval '30 days'; END IF;
      SELECT LEAST(due,s.expires_at+interval '24 hours') INTO due FROM public.conversations c JOIN public.login_sessions s ON s.id=c.context_login_session_id WHERE c.id=a.conversation_id;
      IF due>clock_timestamp() OR due>j.due_at THEN RETURN false; END IF;
      INSERT INTO public.expansion_advice_retirements(attempt_id) VALUES(a.id) ON CONFLICT DO NOTHING;
      DELETE FROM public.expansion_advice_read_payloads WHERE receipt_id IN(SELECT id FROM public.expansion_advice_reads WHERE attempt_id=a.id);
      DELETE FROM public.expansion_advice_payloads WHERE attempt_id=a.id;
      UPDATE public.event_projections SET visible_payload='{}'::jsonb WHERE conversation_id=a.conversation_id
        AND event_type IN ('message.received','message.appended','message.completed');
      UPDATE public.expansion_advice_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL,completed_at=clock_timestamp() WHERE id=j.id;
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_purge_expansion_advice(uuid,uuid) FROM PUBLIC;
    CREATE TABLE expansion_advice_minimizations (
      attempt_id uuid PRIMARY KEY REFERENCES expansion_advice_attempts(id), completed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER expansion_minimizations_immutable BEFORE UPDATE OR DELETE ON expansion_advice_minimizations FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE FUNCTION turas_expansion_advice_detail_guard() RETURNS trigger
    LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
    DECLARE attempt uuid;
    BEGIN
      IF TG_OP<>'DELETE' OR current_user IS DISTINCT FROM pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid=TG_RELID)) THEN
        RAISE EXCEPTION 'Expansion detail is immutable' USING ERRCODE='23514'; END IF;
      attempt:=(to_jsonb(OLD)->>'attempt_id')::uuid;
      IF NOT EXISTS(SELECT 1 FROM public.expansion_advice_attempts a WHERE a.id=attempt
         AND a.created_at<=clock_timestamp()-interval '365 days' AND a.state NOT IN ('prepared','running')
         AND NOT EXISTS(SELECT 1 FROM public.expansion_advice_payloads p WHERE p.attempt_id=a.id)
         AND EXISTS(SELECT 1 FROM public.expansion_native_retirement_receipts n WHERE n.attempt_id=a.id AND n.state='done')) THEN
        RAISE EXCEPTION 'Expansion detail is retained' USING ERRCODE='23514'; END IF;
      RETURN OLD;
    END $$;
    CREATE FUNCTION turas_minimize_expansion_advice(expected_environment text,batch_limit integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE a public.expansion_advice_attempts%ROWTYPE; removed integer:=0;
    BEGIN
      IF batch_limit<1 OR batch_limit>500 OR expected_environment IS DISTINCT FROM (SELECT environment_id FROM public.turas_environment LIMIT 1) THEN
        RAISE EXCEPTION 'Invalid expansion minimization scope' USING ERRCODE='23514'; END IF;
      FOR a IN SELECT x.* FROM public.expansion_advice_attempts x
        WHERE x.environment_id=expected_environment AND x.created_at<=clock_timestamp()-interval '365 days'
          AND x.state NOT IN ('prepared','running')
          AND NOT EXISTS(SELECT 1 FROM public.expansion_advice_payloads p WHERE p.attempt_id=x.id)
          AND NOT EXISTS(SELECT 1 FROM public.expansion_advice_minimizations m WHERE m.attempt_id=x.id)
          AND EXISTS(SELECT 1 FROM public.expansion_native_retirement_receipts n WHERE n.attempt_id=x.id AND n.state='done')
        ORDER BY x.created_at,x.id FOR UPDATE OF x SKIP LOCKED LIMIT batch_limit LOOP
        DELETE FROM public.expansion_advice_read_payloads WHERE receipt_id IN(SELECT id FROM public.expansion_advice_reads WHERE attempt_id=a.id);
        DELETE FROM public.expansion_advice_usage WHERE step_id IN(SELECT id FROM public.expansion_model_step_receipts WHERE attempt_id=a.id);
        DELETE FROM public.expansion_model_step_receipts WHERE attempt_id=a.id;
        DELETE FROM public.expansion_advice_reads WHERE attempt_id=a.id;
        DELETE FROM public.expansion_advice_dependencies WHERE attempt_id=a.id;
        DELETE FROM public.expansion_advice_revision_refs WHERE attempt_id=a.id;
        DELETE FROM public.expansion_advice_cleanup_jobs WHERE attempt_id=a.id AND state='done';
        UPDATE public.expansion_advice_attempts SET native_request_id=NULL,native_session_id=NULL,response_id=NULL,native_turn_id=NULL,response_attempt_id=NULL,
          failure_code=NULL,updated_at=clock_timestamp() WHERE id=a.id;
        INSERT INTO public.expansion_advice_minimizations(attempt_id) VALUES(a.id);
        removed:=removed+1;
      END LOOP;
      RETURN removed;
    END $$;
    REVOKE ALL ON FUNCTION turas_minimize_expansion_advice(text,integer) FROM PUBLIC;
    CREATE FUNCTION turas_expansion_advice_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE c conversations%ROWTYPE; s expansion_scopes%ROWTYPE;
    BEGIN
      SELECT * INTO c FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME<>'expansion_advice_bindings' THEN
        IF EXISTS(SELECT 1 FROM expansion_advice_bindings WHERE conversation_id=c.id) THEN
          RAISE EXCEPTION 'conversation already bound' USING ERRCODE='23514';
        END IF;
      ELSE
        IF EXISTS(SELECT 1 FROM planning_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM staffing_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM execution_advice_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM support_advice_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM event_projections WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=c.id) THEN
          RAISE EXCEPTION 'conversation already bound or populated' USING ERRCODE='23514';
        END IF;
        SELECT * INTO s FROM expansion_scopes WHERE id=NEW.scope_id;
        IF s.environment_id IS DISTINCT FROM NEW.environment_id OR s.workspace_id IS DISTINCT FROM NEW.workspace_id
          OR s.customer_id IS DISTINCT FROM NEW.customer_id OR s.workload_id IS DISTINCT FROM NEW.workload_id
          OR c.environment_id IS DISTINCT FROM NEW.environment_id OR c.workspace_id IS DISTINCT FROM NEW.workspace_id
          OR c.customer_id IS DISTINCT FROM NEW.customer_id OR c.context_audience IS DISTINCT FROM NEW.audience
          OR NEW.audience<>'internal' OR c.context_membership_id IS DISTINCT FROM NEW.owner_membership_id
          OR c.context_snapshot_schema<>'customer-context-v1' OR c.binding_state='failed'
          OR NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.owner_membership_id AND principal_id=c.owner_principal_id
            AND workspace_id=c.workspace_id AND kind='internal' AND active)
          OR NOT EXISTS(SELECT 1 FROM principals p JOIN login_sessions l ON l.principal_id=p.id WHERE p.id=c.owner_principal_id AND p.active AND l.id=c.context_login_session_id AND l.revoked_at IS NULL AND l.expires_at>clock_timestamp()) THEN
          RAISE EXCEPTION 'expansion ownership or scope mismatch' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER expansion_binding_exclusive BEFORE INSERT OR UPDATE ON expansion_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE TRIGGER planning_expansion_exclusive BEFORE INSERT OR UPDATE ON planning_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE TRIGGER staffing_expansion_exclusive BEFORE INSERT OR UPDATE ON staffing_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE TRIGGER execution_expansion_exclusive BEFORE INSERT OR UPDATE ON execution_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE TRIGGER support_expansion_exclusive BEFORE INSERT OR UPDATE ON support_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE TRIGGER research_expansion_exclusive BEFORE INSERT OR UPDATE ON research_requests FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_exclusive();
    CREATE FUNCTION turas_expansion_conversation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS(SELECT 1 FROM expansion_advice_bindings WHERE conversation_id=OLD.id) AND
       ROW(NEW.id,NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.owner_principal_id,NEW.creation_operation_id,
         NEW.context_audience,NEW.context_generation,NEW.context_login_session_id,NEW.context_membership_id,NEW.context_snapshot_schema)
       IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.owner_principal_id,OLD.creation_operation_id,
         OLD.context_audience,OLD.context_generation,OLD.context_login_session_id,OLD.context_membership_id,OLD.context_snapshot_schema) THEN
        RAISE EXCEPTION 'Expansion conversation identity is immutable' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER expansion_conversation_rebind BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION turas_expansion_conversation_identity();
    CREATE FUNCTION turas_expansion_advice_payload_admission() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE a uuid;
    BEGIN
      IF TG_TABLE_NAME='expansion_advice_read_payloads' THEN SELECT attempt_id INTO a FROM expansion_advice_reads WHERE id=NEW.receipt_id;
      ELSE a:=NEW.attempt_id; END IF;
      PERFORM id FROM expansion_advice_attempts WHERE id=a AND created_at+interval '30 days'>clock_timestamp() FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'expansion advice expired' USING ERRCODE='23514'; END IF;
      IF EXISTS(SELECT 1 FROM expansion_advice_retirements WHERE attempt_id=a) THEN
        RAISE EXCEPTION 'expansion advice content retired' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER expansion_advice_payload_admission BEFORE INSERT ON expansion_advice_payloads FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_payload_admission();
    CREATE TRIGGER expansion_advice_read_admission BEFORE INSERT ON expansion_advice_read_payloads FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_payload_admission();
    CREATE TRIGGER expansion_advice_payload_immutable BEFORE UPDATE ON expansion_advice_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER expansion_advice_read_immutable BEFORE UPDATE ON expansion_advice_read_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER expansion_binding_immutable BEFORE UPDATE OR DELETE ON expansion_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER expansion_dependencies_immutable BEFORE UPDATE OR DELETE ON expansion_advice_dependencies FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_detail_guard();
    CREATE TRIGGER expansion_steps_immutable BEFORE UPDATE OR DELETE ON expansion_model_step_receipts FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_detail_guard();
    CREATE TRIGGER expansion_advice_revision_refs_immutable BEFORE UPDATE OR DELETE ON expansion_advice_revision_refs FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_detail_guard();
    CREATE TRIGGER expansion_advice_reads_immutable BEFORE UPDATE OR DELETE ON expansion_advice_reads FOR EACH ROW EXECUTE FUNCTION turas_expansion_advice_detail_guard();
    CREATE TRIGGER expansion_retirements_immutable BEFORE UPDATE OR DELETE ON expansion_advice_retirements FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE OR REPLACE FUNCTION turas_expansion_schedule_retention(expected_environment text,batch_limit integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE scheduled integer;
    BEGIN
      IF batch_limit NOT BETWEEN 1 AND 500 OR NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment) THEN RETURN 0; END IF;
      WITH expired AS (
        SELECT p.id,CASE WHEN EXISTS(SELECT 1 FROM public.expansion_decisions d WHERE d.revision_id=r.id)
          THEN r.created_at+interval '365 days' ELSE r.created_at+interval '90 days' END AS deadline
        FROM public.expansion_payloads p JOIN public.expansion_revisions r ON r.id=p.revision_id
        JOIN public.expansion_hypotheses h ON h.id=r.record_id WHERE h.environment_id=expected_environment
          AND r.id IS DISTINCT FROM h.working_revision_id AND r.id IS DISTINCT FROM h.decided_revision_id
          AND NOT EXISTS(SELECT 1 FROM public.expansion_advice_revision_refs selected
            JOIN public.expansion_advice_attempts advice ON advice.id=selected.attempt_id
            LEFT JOIN public.expansion_advice_retirements retirement ON retirement.attempt_id=advice.id
            WHERE selected.revision_id=r.id AND advice.created_at+interval '30 days'>clock_timestamp()
              AND (retirement.retired_at IS NULL OR retirement.retired_at+interval '24 hours'>clock_timestamp())
              AND EXISTS(SELECT 1 FROM public.expansion_advice_payloads retained WHERE retained.attempt_id=advice.id AND retained.kind='context'))
          AND r.created_at<=clock_timestamp()-CASE WHEN EXISTS(SELECT 1 FROM public.expansion_decisions d WHERE d.revision_id=r.id)
            THEN interval '365 days' ELSE interval '90 days' END
        ORDER BY r.created_at,r.id LIMIT batch_limit
      ) UPDATE public.expansion_payloads p SET purge_at=LEAST(COALESCE(p.purge_at,expired.deadline),expired.deadline) FROM expired WHERE p.id=expired.id;
      INSERT INTO public.expansion_cleanup_jobs(id,payload_id,deadline)
        SELECT gen_random_uuid(),p.id,p.purge_at FROM public.expansion_payloads p
        LEFT JOIN public.expansion_decisions d ON d.id=p.decision_id
        LEFT JOIN public.expansion_revisions r ON r.id=COALESCE(p.revision_id,d.revision_id)
        LEFT JOIN public.expansion_hypotheses h ON h.id=r.record_id
        LEFT JOIN public.expansion_owner_events e ON e.id=p.owner_event_id
        LEFT JOIN public.expansion_account_owners owner ON owner.customer_id=e.customer_id
        WHERE COALESCE(h.environment_id,owner.environment_id)=expected_environment AND p.purge_at<=clock_timestamp()
        ORDER BY p.purge_at,p.id LIMIT batch_limit
        ON CONFLICT(payload_id) DO UPDATE SET deadline=LEAST(expansion_cleanup_jobs.deadline,excluded.deadline);
      GET DIAGNOSTICS scheduled=ROW_COUNT;
      DELETE FROM public.expansion_review_previews WHERE environment_id=expected_environment AND expires_at<=clock_timestamp();
      RETURN scheduled;
    END $$;
  `);
};
exports.down = () => { throw new Error("Expansion advice uses feature disable and forward repair; destructive rollback is unsupported"); };
