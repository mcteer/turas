exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE execution_advice_bindings(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL,
      conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id), owner_membership_id uuid NOT NULL,
      baseline_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation>=1), from_date date NOT NULL, to_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,environment_id,workspace_id), UNIQUE(id,conversation_id,owner_membership_id),
      FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), CHECK(to_date BETWEEN from_date AND from_date+90));
    CREATE TABLE execution_advice_attempts(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), binding_id uuid NOT NULL UNIQUE, conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id),
      owner_membership_id uuid NOT NULL, request_key uuid NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      response_attempt_id uuid UNIQUE REFERENCES response_attempts(id), native_request_id uuid, response_id text, native_turn_id text,
      state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','running','completed','failed','cancelled','expired','unconfirmed')),
      model_steps integer NOT NULL DEFAULT 0 CHECK(model_steps BETWEEN 0 AND 6), read_calls integer NOT NULL DEFAULT 0 CHECK(read_calls BETWEEN 0 AND 6),
      context_bytes integer NOT NULL DEFAULT 0 CHECK(context_bytes BETWEEN 0 AND 24576), dependency_count integer NOT NULL DEFAULT 0 CHECK(dependency_count BETWEEN 0 AND 200),
      dispatch_at timestamptz, deadline_at timestamptz, settled_at timestamptz, failure_code text CHECK(failure_code ~ '^[a-z][a-z0-9_]{0,79}$'),
      updated_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,environment_id,workspace_id), UNIQUE(environment_id,workspace_id,owner_membership_id,request_key),
      FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES execution_advice_bindings(id,environment_id,workspace_id),
      FOREIGN KEY(binding_id,conversation_id,owner_membership_id) REFERENCES execution_advice_bindings(id,conversation_id,owner_membership_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
    CREATE TABLE execution_advice_instruction_payloads(attempt_id uuid PRIMARY KEY REFERENCES execution_advice_attempts(id),
      instruction text NOT NULL CHECK(length(instruction) BETWEEN 1 AND 4000 AND octet_length(instruction)<=16384));
    CREATE TABLE execution_advice_dependencies(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 80), dependency_id uuid NOT NULL, revision_id uuid,
      generation bigint NOT NULL CHECK(generation>=0), content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      UNIQUE(attempt_id,kind,dependency_id));
    CREATE TABLE execution_advice_reads(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 200), tool_name text NOT NULL CHECK(tool_name IN ('execution_summary','execution_records','execution_effort','load_skill')),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6), request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,call_id), UNIQUE(attempt_id,ordinal));
    CREATE TABLE execution_advice_read_results(receipt_id uuid PRIMARY KEY REFERENCES execution_advice_reads(id),
      bytes integer NOT NULL CHECK(bytes BETWEEN 0 AND 24576),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE execution_advice_read_payloads(receipt_id uuid PRIMARY KEY REFERENCES execution_advice_read_results(receipt_id),
      result jsonb NOT NULL CHECK(octet_length(result::text)<=65536));
    CREATE TABLE execution_advice_steps(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6), step_token text NOT NULL CHECK(length(step_token) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,step_token));
    CREATE TABLE execution_advice_usage(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      step_id uuid NOT NULL UNIQUE REFERENCES execution_advice_steps(id), native_event_id text UNIQUE,
      event_type text CHECK(event_type IN ('step.completed','step.failed')), emitted_at timestamptz, input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991), outcome text NOT NULL CHECK(outcome IN ('confirmed','unknown','failed','cancelled')),
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE execution_cleanup_jobs(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL,
      payload_kind text NOT NULL CHECK(payload_kind IN ('record','review','milestone','time','time_decision','reconciliation','advice')),
      revision_id uuid NOT NULL, payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      source_generation bigint NOT NULL CHECK(source_generation>=1), cause_kind text NOT NULL, cause_revision_id uuid NOT NULL, cause_digest text NOT NULL CHECK(cause_digest ~ '^[a-f0-9]{64}$'), ineligible_at timestamptz NOT NULL, due_at timestamptz NOT NULL,
      lease_token uuid, lease_until timestamptz, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done','stale')),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
      CHECK(due_at>=ineligible_at+interval '30 days'));
    CREATE UNIQUE INDEX execution_cleanup_live_identity ON execution_cleanup_jobs(payload_kind,revision_id,payload_digest,source_generation,cause_kind,cause_revision_id) WHERE state<>'stale';
    CREATE INDEX execution_cleanup_due ON execution_cleanup_jobs(state,due_at,lease_until);
    CREATE INDEX execution_advice_source_reverse ON execution_advice_dependencies(kind,dependency_id,revision_id);
    CREATE INDEX execution_advice_pending ON execution_advice_attempts(state,deadline_at);
    CREATE FUNCTION turas_execution_binding_exclusive() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE c conversations%ROWTYPE; BEGIN
      SELECT * INTO c FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'conversation unavailable' USING ERRCODE='23514'; END IF;
      IF (TG_TABLE_NAME<>'execution_advice_bindings' AND EXISTS(SELECT 1 FROM execution_advice_bindings WHERE conversation_id=c.id))
        OR (TG_TABLE_NAME='execution_advice_bindings' AND
          (EXISTS(SELECT 1 FROM planning_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM staffing_conversation_bindings WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM event_projections WHERE conversation_id=c.id)
          OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=c.id))) THEN
        RAISE EXCEPTION 'conversation already bound or populated' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='execution_advice_bindings' THEN
      IF (c.context_audience IS DISTINCT FROM 'internal' OR NEW.customer_id IS DISTINCT FROM c.customer_id OR NEW.workspace_id<>c.workspace_id OR NEW.environment_id<>c.environment_id OR
         NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.owner_membership_id AND principal_id=c.owner_principal_id AND workspace_id=c.workspace_id)) THEN
        RAISE EXCEPTION 'conversation ownership mismatch' USING ERRCODE='23514'; END IF;
      END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER execution_bind_exclusive BEFORE INSERT ON execution_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER planning_execution_exclusive BEFORE INSERT ON planning_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER staffing_execution_exclusive BEFORE INSERT ON staffing_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER research_execution_exclusive BEFORE INSERT OR UPDATE ON research_requests FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
  `);
  pgm.sql(`
    CREATE TABLE execution_advice_context_payloads(attempt_id uuid PRIMARY KEY REFERENCES execution_advice_attempts(id),
      snapshot jsonb NOT NULL CHECK(octet_length(snapshot::text)<=65536));
    CREATE TABLE execution_advice_retirements(attempt_id uuid PRIMARY KEY REFERENCES execution_advice_attempts(id),
      retired_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE execution_native_retirement_receipts(attempt_id uuid PRIMARY KEY REFERENCES execution_advice_retirements(attempt_id),
      state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','done')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
      next_attempt_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
    CREATE TRIGGER execution_native_retirement_identity BEFORE UPDATE OR DELETE ON execution_native_retirement_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_execution_identity('attempt_id');
    CREATE FUNCTION turas_execution_payload_admission() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE a uuid; BEGIN
      IF TG_TABLE_NAME='execution_advice_read_payloads' THEN SELECT attempt_id INTO a FROM execution_advice_reads WHERE id=NEW.receipt_id;
      ELSE a=NEW.attempt_id; END IF;
      PERFORM id FROM execution_advice_attempts WHERE id=a FOR SHARE;
      IF EXISTS(SELECT 1 FROM execution_advice_retirements WHERE attempt_id=a) THEN
        RAISE EXCEPTION 'execution payload retired' USING ERRCODE='23514'; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER execution_context_retired BEFORE INSERT ON execution_advice_context_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_payload_admission();
    CREATE TRIGGER execution_read_retired BEFORE INSERT ON execution_advice_read_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_payload_admission();
    CREATE TRIGGER execution_instruction_retired BEFORE INSERT ON execution_advice_instruction_payloads FOR EACH ROW EXECUTE FUNCTION turas_execution_payload_admission();
    CREATE TRIGGER execution_advice_context_payloads_no_update BEFORE UPDATE ON execution_advice_context_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE TRIGGER execution_advice_retirements_immutable BEFORE UPDATE OR DELETE ON execution_advice_retirements
      FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();
    CREATE VIEW execution_cleanup_source_identities AS
      SELECT 'execution_record'::text AS kind,id AS revision_id,environment_id,revision_number AS generation,content_digest AS digest FROM execution_record_revisions
      UNION ALL SELECT 'execution_time',id,environment_id,revision_number,content_digest FROM execution_time_revisions
      UNION ALL SELECT 'milestone_baseline',id,environment_id,baseline_number,content_digest FROM milestone_baselines
      UNION ALL SELECT 'accepted_profile',v.id,e.environment_id,v.revision_number,v.content_digest FROM profile_revisions v CROSS JOIN turas_environment e
      UNION ALL SELECT 'approved_excerpt',id,environment_id,lifecycle_generation,excerpt_digest FROM artifact_evidence_selections
      UNION ALL SELECT 'verified_research',v.id,e.environment_id,v.version,v.passage_digest FROM evidence_source_revisions v CROSS JOIN turas_environment e
      UNION ALL SELECT 'shared_knowledge',r.id,p.environment_id,p.head_generation,r.content_digest FROM knowledge_revisions r JOIN knowledge_publications p ON p.revision_id=r.id
      UNION ALL SELECT 'advice',a.id,a.environment_id,b.generation,a.request_digest FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id;
    CREATE VIEW execution_cleanup_payload_identities AS
      SELECT 'record'::text AS kind,v.id AS revision_id,v.environment_id,v.workspace_id,v.customer_id,v.engagement_id,v.content_digest AS digest
        FROM execution_record_revisions v JOIN execution_record_payloads p ON p.revision_id=v.id
      UNION ALL SELECT 'review',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,encode(sha256(convert_to(p.rationale,'UTF8')),'hex')
        FROM execution_review_decisions d JOIN execution_review_payloads p ON p.decision_id=d.id
      UNION ALL SELECT 'milestone',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,encode(sha256(convert_to(p.rationale,'UTF8')),'hex')
        FROM execution_milestone_events d JOIN execution_milestone_payloads p ON p.event_id=d.id
      UNION ALL SELECT 'time',v.id,v.environment_id,v.workspace_id,v.customer_id,v.engagement_id,v.content_digest
        FROM execution_time_revisions v JOIN execution_time_payloads p ON p.revision_id=v.id
      UNION ALL SELECT 'time_decision',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,encode(sha256(convert_to(jsonb_build_object('rationale',p.rationale,'exceptions',p.exceptions)::text,'UTF8')),'hex')
        FROM execution_time_decisions d JOIN execution_time_decision_payloads p ON p.decision_id=d.id
      UNION ALL SELECT 'reconciliation',d.id,d.environment_id,d.workspace_id,d.customer_id,d.engagement_id,d.rationale_digest
        FROM execution_reconciliations d JOIN execution_reconciliation_payloads p ON p.reconciliation_id=d.id
      UNION ALL SELECT 'advice',a.id,a.environment_id,a.workspace_id,b.customer_id,b.engagement_id,a.request_digest
        FROM execution_advice_attempts a JOIN execution_advice_bindings b ON b.id=a.binding_id
        WHERE NOT EXISTS(SELECT 1 FROM execution_advice_retirements r WHERE r.attempt_id=a.id);
    CREATE FUNCTION turas_claim_execution_cleanup(p_env text) RETURNS SETOF execution_cleanup_jobs
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
      RETURN QUERY WITH due AS (SELECT id FROM execution_cleanup_jobs WHERE environment_id=p_env AND due_at<=clock_timestamp()
        AND (state='pending' OR (state='leased' AND lease_until<=clock_timestamp())) ORDER BY due_at,id FOR UPDATE SKIP LOCKED LIMIT 100)
      UPDATE execution_cleanup_jobs j SET state='leased',lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds'
        FROM due WHERE j.id=due.id RETURNING j.*;
    END $$;
    CREATE FUNCTION turas_finish_execution_cleanup(p_env text,p_id uuid,p_token uuid,p_revision uuid,p_digest text,p_generation bigint,p_purge boolean)
      RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
      DECLARE j execution_cleanup_jobs%ROWTYPE; a execution_advice_attempts%ROWTYPE; BEGIN
      SELECT * INTO j FROM execution_cleanup_jobs WHERE id=p_id AND environment_id=p_env AND state='leased' AND lease_token=p_token
        AND lease_until>clock_timestamp() AND due_at<=clock_timestamp() AND ineligible_at<=clock_timestamp()-interval '30 days'
        AND revision_id=p_revision AND payload_digest=p_digest AND source_generation=p_generation FOR UPDATE;
      IF NOT FOUND THEN RETURN false; END IF;
      IF NOT p_purge THEN UPDATE execution_cleanup_jobs SET state='stale',lease_until=NULL WHERE id=j.id; RETURN false; END IF;
      IF NOT EXISTS(SELECT 1 FROM execution_cleanup_source_identities c WHERE c.kind=j.cause_kind AND c.revision_id=j.cause_revision_id
        AND c.environment_id=j.environment_id AND c.generation=j.source_generation AND c.digest=j.cause_digest) THEN RETURN false; END IF;
      IF NOT EXISTS(SELECT 1 FROM execution_cleanup_payload_identities p WHERE p.kind=j.payload_kind AND p.revision_id=j.revision_id
        AND p.digest=j.payload_digest AND p.environment_id=j.environment_id AND p.workspace_id=j.workspace_id
        AND p.customer_id=j.customer_id AND p.engagement_id=j.engagement_id) THEN
        UPDATE execution_cleanup_jobs SET state='stale',lease_until=NULL WHERE id=j.id; RETURN false; END IF;
      CASE j.payload_kind
        WHEN 'record' THEN DELETE FROM execution_record_payloads WHERE revision_id=j.revision_id;
        WHEN 'review' THEN DELETE FROM execution_review_payloads WHERE decision_id=j.revision_id;
        WHEN 'milestone' THEN DELETE FROM execution_milestone_payloads WHERE event_id=j.revision_id;
        WHEN 'time' THEN DELETE FROM execution_time_payloads WHERE revision_id=j.revision_id;
        WHEN 'time_decision' THEN DELETE FROM execution_time_decision_payloads WHERE decision_id=j.revision_id;
        WHEN 'reconciliation' THEN DELETE FROM execution_reconciliation_payloads WHERE reconciliation_id=j.revision_id;
        WHEN 'advice' THEN
          SELECT * INTO a FROM execution_advice_attempts WHERE id=j.revision_id FOR UPDATE;
          INSERT INTO execution_advice_retirements(attempt_id) VALUES(a.id) ON CONFLICT DO NOTHING;
          INSERT INTO execution_native_retirement_receipts(attempt_id) SELECT a.id FROM conversations c WHERE c.id=a.conversation_id AND c.eve_session_id IS NOT NULL ON CONFLICT DO NOTHING;
          DELETE FROM execution_advice_context_payloads WHERE attempt_id=a.id;
          DELETE FROM execution_advice_instruction_payloads WHERE attempt_id=a.id;
          DELETE FROM execution_advice_read_payloads WHERE receipt_id IN(SELECT id FROM execution_advice_reads WHERE attempt_id=a.id);
          UPDATE event_projections SET visible_payload='{}'::jsonb WHERE conversation_id=a.conversation_id AND
            (turn_id=a.native_turn_id OR a.native_turn_id IS NULL) AND event_type IN('message.received','message.appended','message.completed');
      END CASE;
      UPDATE execution_cleanup_jobs SET state='done',lease_until=NULL WHERE id=j.id;
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_claim_execution_cleanup(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION turas_finish_execution_cleanup(text,uuid,uuid,uuid,text,bigint,boolean) FROM PUBLIC;
  `);
  pgm.sql(`CREATE TRIGGER execution_advice_read_payloads_no_update BEFORE UPDATE ON execution_advice_read_payloads
    FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  pgm.sql(`CREATE TRIGGER execution_advice_instruction_payloads_no_update BEFORE UPDATE ON execution_advice_instruction_payloads
    FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const name of ['execution_advice_bindings','execution_advice_dependencies','execution_advice_reads','execution_advice_read_results','execution_advice_steps','execution_advice_usage'])
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  pgm.sql(`CREATE TRIGGER execution_advice_attempts_identity BEFORE UPDATE OR DELETE ON execution_advice_attempts FOR EACH ROW
    EXECUTE FUNCTION turas_execution_identity('id','environment_id','workspace_id','binding_id','conversation_id','owner_membership_id','request_key','request_digest');`);
};
exports.down = () => { throw new Error('Execution history requires forward repair or matched restore'); };
