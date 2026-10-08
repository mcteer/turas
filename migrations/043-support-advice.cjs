exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE support_advice_bindings (
      id uuid PRIMARY KEY, scope_id uuid NOT NULL, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, customer_id uuid NOT NULL, workload_id uuid,
      audience text NOT NULL CHECK(audience IN ('internal','delivery')),
      conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id), owner_membership_id uuid NOT NULL,
      selected_engagement_ids uuid[] NOT NULL CHECK(cardinality(selected_engagement_ids)<=10),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,environment_id,workspace_id), UNIQUE(id,conversation_id,owner_membership_id),
      FOREIGN KEY(scope_id) REFERENCES support_scopes(id),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE support_advice_attempts (
      id uuid PRIMARY KEY, binding_id uuid NOT NULL UNIQUE, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
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
      UNIQUE(environment_id,workspace_id,owner_membership_id,request_key),
      FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES support_advice_bindings(id,environment_id,workspace_id),
      FOREIGN KEY(binding_id,conversation_id,owner_membership_id) REFERENCES support_advice_bindings(id,conversation_id,owner_membership_id)
    );
    CREATE UNIQUE INDEX support_advice_active_owner ON support_advice_attempts(environment_id,workspace_id,owner_membership_id)
      WHERE state IN ('prepared','running','unconfirmed');
    CREATE INDEX support_advice_admission_window ON support_advice_attempts(environment_id,workspace_id,owner_membership_id,dispatch_at);
    CREATE INDEX support_advice_pending ON support_advice_attempts(state,deadline_at);
    CREATE TABLE support_advice_dependencies (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES support_advice_attempts(id),
      kind text NOT NULL CHECK(kind IN ('accepted_profile','approved_excerpt','verified_research','shared_knowledge',
        'execution_record','milestone_baseline','support_head','support_scope','profile_collection','shared_collection','execution_collection')),
      dependency_id uuid NOT NULL, revision_id uuid, generation bigint NOT NULL CHECK(generation>=0),
      content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      UNIQUE(attempt_id,kind,dependency_id)
    );
    CREATE INDEX support_advice_reverse_sources ON support_advice_dependencies(kind,dependency_id,revision_id);
    CREATE TABLE support_advice_retirements (
      attempt_id uuid PRIMARY KEY REFERENCES support_advice_attempts(id), retired_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE support_advice_payloads (
      attempt_id uuid NOT NULL REFERENCES support_advice_attempts(id),
      kind text NOT NULL CHECK(kind IN ('instruction','context','source_map','output')),
      content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536), PRIMARY KEY(attempt_id,kind)
    );
    CREATE TABLE support_advice_reads (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES support_advice_attempts(id),
      call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 200),
      tool_name text NOT NULL CHECK(tool_name IN ('support_summary','support_actions','support_evidence','load_skill')),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6),
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      context_bytes integer NOT NULL CHECK(context_bytes BETWEEN 0 AND 24576),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,call_id), UNIQUE(attempt_id,ordinal)
    );
    CREATE TABLE support_advice_read_payloads (
      receipt_id uuid PRIMARY KEY REFERENCES support_advice_reads(id),
      payload jsonb NOT NULL CHECK(octet_length(payload::text)<=65536)
    );
    CREATE TABLE support_model_step_receipts (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES support_advice_attempts(id),
      native_session_id text NOT NULL, response_attempt_id uuid NOT NULL REFERENCES response_attempts(id),
      native_turn_id text NOT NULL, ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6),
      step_token text NOT NULL CHECK(length(step_token) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,step_token)
    );
    CREATE TABLE support_advice_usage (
      step_id uuid PRIMARY KEY REFERENCES support_model_step_receipts(id), native_event_id text UNIQUE,
      outcome text NOT NULL CHECK(outcome IN ('confirmed','unknown','failed','cancelled')),
      input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE support_advice_cleanup_jobs (
      id uuid PRIMARY KEY, attempt_id uuid NOT NULL UNIQUE REFERENCES support_advice_attempts(id),
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'), due_at timestamptz NOT NULL,
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done')),
      lease_token uuid, lease_until timestamptz, completed_at timestamptz,
      CHECK((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
    );
    CREATE INDEX support_advice_cleanup_due ON support_advice_cleanup_jobs(state,due_at);
    CREATE TABLE support_native_retirement_receipts (
      attempt_id uuid PRIMARY KEY REFERENCES support_advice_attempts(id),
      state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','done')),
      attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
      next_attempt_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
    );
    CREATE INDEX support_native_retirement_due ON support_native_retirement_receipts(state,next_attempt_at);
    CREATE TRIGGER support_attempt_identity BEFORE UPDATE OR DELETE ON support_advice_attempts FOR EACH ROW
      EXECUTE FUNCTION turas_execution_identity('id','binding_id','environment_id','workspace_id','conversation_id','owner_membership_id','request_key','request_digest','created_at');
    CREATE FUNCTION turas_purge_support_advice(p_job uuid,p_lease uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE j public.support_advice_cleanup_jobs%ROWTYPE; a public.support_advice_attempts%ROWTYPE; due timestamptz;
    BEGIN
      SELECT * INTO j FROM public.support_advice_cleanup_jobs WHERE id=p_job FOR UPDATE;
      IF NOT FOUND OR j.state<>'leased' OR j.lease_token IS DISTINCT FROM p_lease OR j.lease_until<=clock_timestamp()
        OR j.due_at>clock_timestamp() THEN RETURN false; END IF;
      SELECT * INTO a FROM public.support_advice_attempts WHERE id=j.attempt_id FOR UPDATE;
      IF NOT FOUND OR a.request_digest<>j.request_digest THEN RETURN false; END IF;
      SELECT LEAST(COALESCE(a.settled_at,'infinity'::timestamptz),COALESCE(a.deadline_at,'infinity'::timestamptz))+interval '30 days' INTO due;
      SELECT LEAST(due,retired_at+interval '24 hours') INTO due FROM public.support_advice_retirements WHERE attempt_id=a.id;
      IF NOT FOUND THEN due:=LEAST(COALESCE(a.settled_at,'infinity'::timestamptz),COALESCE(a.deadline_at,'infinity'::timestamptz))+interval '30 days'; END IF;
      IF due>clock_timestamp() OR due>j.due_at THEN RETURN false; END IF;
      INSERT INTO public.support_advice_retirements(attempt_id) VALUES(a.id) ON CONFLICT DO NOTHING;
      DELETE FROM public.support_advice_read_payloads WHERE receipt_id IN(SELECT id FROM public.support_advice_reads WHERE attempt_id=a.id);
      DELETE FROM public.support_advice_payloads WHERE attempt_id=a.id;
      UPDATE public.event_projections SET visible_payload='{}'::jsonb WHERE conversation_id=a.conversation_id
        AND event_type IN ('message.received','message.appended','message.completed');
      UPDATE public.support_advice_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL,completed_at=clock_timestamp() WHERE id=j.id;
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_purge_support_advice(uuid,uuid) FROM PUBLIC;
    CREATE FUNCTION turas_support_advice_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE c conversations%ROWTYPE; s support_scopes%ROWTYPE;
    BEGIN
      SELECT * INTO c FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME<>'support_advice_bindings' THEN
        IF EXISTS(SELECT 1 FROM support_advice_bindings WHERE conversation_id=c.id) THEN
          RAISE EXCEPTION 'conversation already bound' USING ERRCODE='23514';
        END IF;
      ELSE
        IF EXISTS(SELECT 1 FROM planning_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM staffing_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM execution_advice_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM event_projections WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=c.id) THEN
          RAISE EXCEPTION 'conversation already bound or populated' USING ERRCODE='23514';
        END IF;
        SELECT * INTO s FROM support_scopes WHERE id=NEW.scope_id;
        IF s.environment_id IS DISTINCT FROM NEW.environment_id OR s.workspace_id IS DISTINCT FROM NEW.workspace_id
          OR s.customer_id IS DISTINCT FROM NEW.customer_id OR s.workload_id IS DISTINCT FROM NEW.workload_id
          OR c.environment_id IS DISTINCT FROM NEW.environment_id OR c.workspace_id IS DISTINCT FROM NEW.workspace_id
          OR c.customer_id IS DISTINCT FROM NEW.customer_id OR c.context_audience IS DISTINCT FROM NEW.audience
          OR NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.owner_membership_id AND principal_id=c.owner_principal_id
            AND workspace_id=c.workspace_id AND kind='internal' AND active) THEN
          RAISE EXCEPTION 'support ownership or scope mismatch' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER support_binding_exclusive BEFORE INSERT ON support_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_support_advice_exclusive();
    CREATE TRIGGER planning_support_exclusive BEFORE INSERT ON planning_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_support_advice_exclusive();
    CREATE TRIGGER staffing_support_exclusive BEFORE INSERT ON staffing_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_support_advice_exclusive();
    CREATE TRIGGER execution_support_exclusive BEFORE INSERT ON execution_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_support_advice_exclusive();
    CREATE TRIGGER research_support_exclusive BEFORE INSERT OR UPDATE ON research_requests FOR EACH ROW EXECUTE FUNCTION turas_support_advice_exclusive();
    CREATE FUNCTION turas_support_advice_payload_admission() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE a uuid;
    BEGIN
      IF TG_TABLE_NAME='support_advice_read_payloads' THEN SELECT attempt_id INTO a FROM support_advice_reads WHERE id=NEW.receipt_id;
      ELSE a:=NEW.attempt_id; END IF;
      PERFORM id FROM support_advice_attempts WHERE id=a FOR SHARE;
      IF EXISTS(SELECT 1 FROM support_advice_retirements WHERE attempt_id=a) THEN
        RAISE EXCEPTION 'support advice content retired' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER support_advice_payload_admission BEFORE INSERT ON support_advice_payloads FOR EACH ROW EXECUTE FUNCTION turas_support_advice_payload_admission();
    CREATE TRIGGER support_advice_read_admission BEFORE INSERT ON support_advice_read_payloads FOR EACH ROW EXECUTE FUNCTION turas_support_advice_payload_admission();
    CREATE TRIGGER support_advice_payload_immutable BEFORE UPDATE ON support_advice_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER support_advice_read_immutable BEFORE UPDATE ON support_advice_read_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER support_binding_immutable BEFORE UPDATE OR DELETE ON support_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER support_dependencies_immutable BEFORE UPDATE OR DELETE ON support_advice_dependencies FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER support_steps_immutable BEFORE UPDATE OR DELETE ON support_model_step_receipts FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER support_retirements_immutable BEFORE UPDATE OR DELETE ON support_advice_retirements FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
  `);
};
exports.down = () => { throw new Error("Support advice uses feature disable and forward repair; destructive rollback is unsupported"); };
