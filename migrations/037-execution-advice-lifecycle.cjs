exports.up = pgm => {
  pgm.sql(`
    CREATE TABLE execution_advice_bindings(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL,
      conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id), owner_membership_id uuid NOT NULL,
      baseline_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation>=1), from_date date NOT NULL, to_date date NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,environment_id,workspace_id),
      FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), CHECK(to_date BETWEEN from_date AND from_date+90));
    CREATE TABLE execution_advice_attempts(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), binding_id uuid NOT NULL, conversation_id uuid NOT NULL REFERENCES conversations(id),
      owner_membership_id uuid NOT NULL, request_key uuid NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      response_attempt_id uuid UNIQUE REFERENCES response_attempts(id), native_request_id uuid, response_id text, native_turn_id text,
      state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','running','completed','failed','cancelled','expired','unconfirmed')),
      model_steps integer NOT NULL DEFAULT 0 CHECK(model_steps BETWEEN 0 AND 6), read_calls integer NOT NULL DEFAULT 0 CHECK(read_calls BETWEEN 0 AND 6),
      context_bytes integer NOT NULL DEFAULT 0 CHECK(context_bytes BETWEEN 0 AND 24576), dependency_count integer NOT NULL DEFAULT 0 CHECK(dependency_count BETWEEN 0 AND 200),
      dispatch_at timestamptz, deadline_at timestamptz, settled_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,environment_id,workspace_id), UNIQUE(environment_id,workspace_id,owner_membership_id,request_key),
      FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES execution_advice_bindings(id,environment_id,workspace_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
    CREATE TABLE execution_advice_dependencies(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      kind text NOT NULL CHECK(length(kind) BETWEEN 1 AND 80), dependency_id uuid NOT NULL, revision_id uuid,
      generation bigint NOT NULL CHECK(generation>=1), content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      UNIQUE(attempt_id,kind,dependency_id));
    CREATE TABLE execution_advice_reads(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      call_id text NOT NULL CHECK(length(call_id) BETWEEN 1 AND 200), tool_name text NOT NULL CHECK(tool_name IN ('execution_summary','execution_records','execution_effort','load_skill')),
      bytes integer NOT NULL CHECK(bytes BETWEEN 0 AND 24576), content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,call_id));
    CREATE TABLE execution_advice_steps(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6), step_token text NOT NULL CHECK(length(step_token) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,step_token));
    CREATE TABLE execution_advice_usage(id uuid PRIMARY KEY, attempt_id uuid NOT NULL REFERENCES execution_advice_attempts(id),
      step_id uuid NOT NULL UNIQUE REFERENCES execution_advice_steps(id), input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 4096), outcome text NOT NULL CHECK(outcome IN ('confirmed','unknown','failed','cancelled')),
      created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE execution_cleanup_jobs(id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL,
      payload_kind text NOT NULL CHECK(payload_kind IN ('record','review','milestone','time','time_decision','advice')),
      revision_id uuid NOT NULL, payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),
      source_generation bigint NOT NULL CHECK(source_generation>=1), ineligible_at timestamptz NOT NULL, due_at timestamptz NOT NULL,
      lease_token uuid, lease_until timestamptz, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done','stale')),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(payload_kind,revision_id,payload_digest,source_generation),
      FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
      CHECK(due_at>=ineligible_at+interval '30 days'));
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
          OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=c.id AND state IN ('draft','admitted')))) THEN
        RAISE EXCEPTION 'conversation already bound or populated' USING ERRCODE='23514'; END IF;
      IF TG_TABLE_NAME='execution_advice_bindings' AND
        (NEW.workspace_id<>c.workspace_id OR NEW.environment_id<>c.environment_id OR
         NOT EXISTS(SELECT 1 FROM memberships WHERE id=NEW.owner_membership_id AND principal_id=c.owner_principal_id AND workspace_id=c.workspace_id)) THEN
        RAISE EXCEPTION 'conversation ownership mismatch' USING ERRCODE='23514'; END IF;
      RETURN NEW; END $$;
    CREATE TRIGGER execution_bind_exclusive BEFORE INSERT ON execution_advice_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER planning_execution_exclusive BEFORE INSERT ON planning_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER staffing_execution_exclusive BEFORE INSERT ON staffing_conversation_bindings FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
    CREATE TRIGGER research_execution_exclusive BEFORE INSERT OR UPDATE ON research_requests FOR EACH ROW EXECUTE FUNCTION turas_execution_binding_exclusive();
  `);
  for (const name of ['execution_advice_bindings','execution_advice_dependencies','execution_advice_reads','execution_advice_steps','execution_advice_usage'])
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  pgm.sql(`CREATE TRIGGER execution_advice_attempts_identity BEFORE UPDATE OR DELETE ON execution_advice_attempts FOR EACH ROW
    EXECUTE FUNCTION turas_execution_identity('id','environment_id','workspace_id','binding_id','conversation_id','owner_membership_id','request_key','request_digest');`);
};
exports.down = () => { throw new Error('Execution history requires forward repair or matched restore'); };
