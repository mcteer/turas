exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE planning_conversation_bindings (
      conversation_id uuid PRIMARY KEY REFERENCES conversations(id),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      workload_id uuid,
      plan_id uuid NOT NULL,
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      owner_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (workload_id,workspace_id,customer_id)
        REFERENCES customer_workloads(id,workspace_id,customer_id),
      FOREIGN KEY (owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TRIGGER planning_bindings_immutable BEFORE UPDATE OR DELETE ON planning_conversation_bindings
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE FUNCTION turas_planning_binding_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM delivery_plans plan
        JOIN conversations conversation ON conversation.id=NEW.conversation_id
        JOIN memberships member ON member.id=NEW.owner_membership_id
        WHERE plan.id=NEW.plan_id AND plan.environment_id=NEW.environment_id
          AND plan.workspace_id=NEW.workspace_id AND plan.customer_id=NEW.customer_id
          AND plan.workload_id IS NOT DISTINCT FROM NEW.workload_id
          AND plan.audience=NEW.audience
          AND conversation.environment_id=NEW.environment_id
          AND conversation.workspace_id=NEW.workspace_id
          AND conversation.customer_id=NEW.customer_id
          AND conversation.owner_principal_id=member.principal_id
          AND NOT EXISTS (SELECT 1 FROM submitted_messages message
            WHERE message.conversation_id=NEW.conversation_id)) THEN
        RAISE EXCEPTION 'planning binding requires a fresh same-scope conversation'
          USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER planning_binding_scope BEFORE INSERT ON planning_conversation_bindings
      FOR EACH ROW EXECUTE FUNCTION turas_planning_binding_scope();

    CREATE TABLE plan_drafting_attempts (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      plan_id uuid NOT NULL,
      base_revision_id uuid NOT NULL,
      base_aggregate_version bigint NOT NULL CHECK (base_aggregate_version >= 1),
      conversation_id uuid NOT NULL UNIQUE REFERENCES planning_conversation_bindings(conversation_id),
      actor_membership_id uuid NOT NULL,
      actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      response_attempt_id uuid UNIQUE REFERENCES response_attempts(id),
      request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      state text NOT NULL CHECK (state IN
        ('prepared','running','saved','failed','cancelled','expired','unconfirmed')),
      deadline_at timestamptz NOT NULL,
      steps_admitted smallint NOT NULL DEFAULT 0 CHECK (steps_admitted BETWEEN 0 AND 6),
      retrieval_calls smallint NOT NULL DEFAULT 0 CHECK (retrieval_calls BETWEEN 0 AND 4),
      context_bytes integer NOT NULL DEFAULT 0 CHECK (context_bytes BETWEEN 0 AND 24576),
      result_revision_id uuid UNIQUE,
      safe_error_code text CHECK (safe_error_code IS NULL OR length(safe_error_code) <= 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id,plan_id),
      UNIQUE (actor_membership_id,request_key),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (base_revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (result_revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      CHECK (state <> 'saved' OR result_revision_id IS NOT NULL),
      CHECK (state <> 'running' OR response_attempt_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX plan_drafting_one_active_idx ON plan_drafting_attempts(plan_id)
      WHERE state IN ('prepared','running');
    CREATE INDEX plan_drafting_owner_time_idx ON plan_drafting_attempts
      (actor_membership_id,created_at DESC,id);
    ALTER TABLE plan_revisions ADD CONSTRAINT plan_revision_drafting_attempt_fk
      FOREIGN KEY (drafting_attempt_id,plan_id) REFERENCES plan_drafting_attempts(id,plan_id);

    CREATE TABLE plan_drafting_instruction_payloads (
      attempt_id uuid PRIMARY KEY REFERENCES plan_drafting_attempts(id),
      instructions text NOT NULL CHECK (length(btrim(instructions)) BETWEEN 1 AND 8000),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TRIGGER plan_drafting_instructions_no_update
      BEFORE UPDATE ON plan_drafting_instruction_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TABLE plan_drafting_source_dependencies (
      attempt_id uuid NOT NULL REFERENCES plan_drafting_attempts(id),
      source_kind text NOT NULL CHECK (source_kind IN
        ('accepted_profile','approved_excerpt','verified_research','shared_knowledge')),
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
      consumed_bytes integer NOT NULL CHECK (consumed_bytes >= 0),
      PRIMARY KEY (attempt_id,source_kind,source_revision_id,source_generation)
    );

    CREATE TABLE plan_drafting_context_chunks (
      attempt_id uuid NOT NULL REFERENCES plan_drafting_attempts(id),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      bytes integer NOT NULL CHECK (bytes BETWEEN 1 AND 24576),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (attempt_id,content_digest)
    );

    CREATE TABLE plan_model_step_receipts (
      attempt_id uuid NOT NULL REFERENCES plan_drafting_attempts(id),
      turn_id text NOT NULL CHECK (length(turn_id) BETWEEN 1 AND 200),
      step_index smallint NOT NULL CHECK (step_index BETWEEN 0 AND 5),
      operation_id uuid NOT NULL UNIQUE,
      provider_state text NOT NULL CHECK (provider_state IN
        ('admitted','started','completed','failed','unconfirmed')),
      input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
      output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
      admitted_at timestamptz NOT NULL DEFAULT now(),
      provider_started_at timestamptz,
      completed_at timestamptz,
      PRIMARY KEY (attempt_id,turn_id,step_index),
      CHECK (provider_state NOT IN ('started','completed','unconfirmed') OR
        provider_started_at IS NOT NULL)
    );

    CREATE TABLE plan_command_receipts (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL,
      request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      action text NOT NULL CHECK (length(action) BETWEEN 1 AND 60),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      plan_id uuid,
      result_ids jsonb NOT NULL DEFAULT '{}'::jsonb CHECK
        (jsonb_typeof(result_ids)='object' AND octet_length(result_ids::text) <= 2048),
      result_version bigint CHECK (result_version IS NULL OR result_version >= 1),
      outcome_code text NOT NULL CHECK (length(outcome_code) BETWEEN 1 AND 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,workspace_id,actor_membership_id,request_key),
      FOREIGN KEY (customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY (actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id)
    );
    CREATE TRIGGER plan_command_receipts_immutable BEFORE UPDATE OR DELETE ON plan_command_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();

    CREATE TABLE plan_cleanup_jobs (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      revision_id uuid NOT NULL REFERENCES plan_revisions(id),
      source_generation bigint CHECK (source_generation IS NULL OR source_generation >= 1),
      reason_code text NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 100),
      state text NOT NULL CHECK (state IN ('queued','running','completed','failed')),
      attempts smallint NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 10),
      last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (revision_id,source_generation,reason_code)
    );
    CREATE INDEX plan_cleanup_pending_idx ON plan_cleanup_jobs
      (state,created_at,id) WHERE state IN ('queued','failed');

    CREATE FUNCTION turas_purge_plan_revision_payload(p_job_id uuid) RETURNS boolean
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE target_revision uuid;
    BEGIN
      SELECT revision_id INTO target_revision FROM plan_cleanup_jobs
        WHERE id=p_job_id AND state='running' FOR UPDATE;
      IF target_revision IS NULL THEN RETURN false; END IF;
      DELETE FROM milestone_baseline_payloads payload
        USING milestone_baselines baseline
        WHERE payload.baseline_id=baseline.id AND baseline.revision_id=target_revision;
      DELETE FROM plan_decision_payloads payload USING plan_decisions decision
        WHERE payload.decision_id=decision.id AND decision.revision_id=target_revision;
      DELETE FROM plan_event_payloads payload USING plan_revision_events event
        WHERE payload.event_id=event.id AND event.revision_id=target_revision;
      DELETE FROM plan_revision_payloads WHERE revision_id=target_revision;
      UPDATE plan_cleanup_jobs SET state='completed',updated_at=now()
        WHERE id=p_job_id;
      RETURN true;
    END;
    $$;
    REVOKE ALL ON FUNCTION turas_purge_plan_revision_payload(uuid) FROM PUBLIC;

    CREATE FUNCTION turas_prune_plan_ephemera(p_environment_id text,p_batch integer)
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE previews_deleted integer; instructions_deleted integer;
    BEGIN
      IF p_batch < 1 OR p_batch > 100 OR NOT EXISTS
        (SELECT 1 FROM turas_environment WHERE environment_id=p_environment_id) THEN
        RAISE EXCEPTION 'invalid plan cleanup scope' USING ERRCODE='22023';
      END IF;
      WITH expired AS (
        SELECT id FROM plan_review_previews
        WHERE environment_id=p_environment_id AND used_decision_id IS NULL
          AND created_at < now()-interval '24 hours'
        ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT p_batch
      )
      DELETE FROM plan_review_previews preview USING expired
        WHERE preview.id=expired.id;
      GET DIAGNOSTICS previews_deleted = ROW_COUNT;
      WITH terminal AS (
        SELECT payload.attempt_id FROM plan_drafting_instruction_payloads payload
        JOIN plan_drafting_attempts attempt ON attempt.id=payload.attempt_id
        WHERE attempt.environment_id=p_environment_id
          AND attempt.state IN ('saved','failed','cancelled','expired','unconfirmed')
          AND attempt.updated_at < now()-interval '30 days'
        ORDER BY attempt.updated_at,payload.attempt_id
        FOR UPDATE OF payload SKIP LOCKED LIMIT p_batch
      )
      DELETE FROM plan_drafting_instruction_payloads payload USING terminal
        WHERE payload.attempt_id=terminal.attempt_id;
      GET DIAGNOSTICS instructions_deleted = ROW_COUNT;
      RETURN previews_deleted+instructions_deleted;
    END;
    $$;
    REVOKE ALL ON FUNCTION turas_prune_plan_ephemera(text,integer) FROM PUBLIC;
  `);
};

exports.down = () => { throw new Error('Planning attempts require forward repair'); };
