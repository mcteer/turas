exports.up = (pgm) => {
  const scoped = (name, fields, constraints = '') => `CREATE TABLE ${name} (
    id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
    workspace_id uuid NOT NULL REFERENCES workspaces(id), ${fields},
    UNIQUE(id,environment_id,workspace_id) ${constraints ? ',' + constraints : ''});`;
  pgm.sql([
    scoped('staffing_economic_inputs', `kind text NOT NULL CHECK(kind IN ('loaded_cost','service','revenue','nonlabor')),
      resource_id uuid, customer_id uuid, engagement_id uuid, baseline_id uuid,
      current_revision_id uuid, aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(id,kind), FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
       FOREIGN KEY(created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK((kind IN ('loaded_cost','service') AND resource_id IS NOT NULL AND customer_id IS NULL AND engagement_id IS NULL AND baseline_id IS NULL)
        OR (kind IN ('revenue','nonlabor') AND resource_id IS NULL AND customer_id IS NOT NULL AND engagement_id IS NOT NULL AND baseline_id IS NOT NULL))`),
    scoped('staffing_economic_input_revisions', `input_id uuid NOT NULL, kind text NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      currency text NOT NULL CHECK(currency IN ('USD','EUR','GBP','CAD','AUD','JPY')),
      minor_units text NOT NULL CHECK(minor_units ~ '^(0|[1-9][0-9]{0,12})$' AND minor_units::numeric<=1000000000000),
      from_date date NOT NULL, to_date date NOT NULL,
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(input_id,revision_number), UNIQUE(id,input_id),
       FOREIGN KEY(input_id,environment_id,workspace_id) REFERENCES staffing_economic_inputs(id,environment_id,workspace_id),
       FOREIGN KEY(input_id,kind) REFERENCES staffing_economic_inputs(id,kind),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date>from_date AND to_date<=DATE '2100-12-31'),
       CHECK(kind NOT IN ('loaded_cost','service') OR minor_units::numeric<=100000000)`),
    `CREATE TABLE staffing_economic_input_payloads(revision_id uuid PRIMARY KEY REFERENCES staffing_economic_input_revisions(id),
      provenance text NOT NULL CHECK(length(btrim(provenance)) BETWEEN 1 AND 2000),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));
     ALTER TABLE staffing_economic_inputs ADD FOREIGN KEY(current_revision_id,id) REFERENCES staffing_economic_input_revisions(id,input_id);`,
    scoped('staffing_finance_policy_decisions', `actor_membership_id uuid NOT NULL,
      actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      formula_version text NOT NULL CHECK(formula_version='staffing-economics-v1'),
      input_policy_digest text NOT NULL CHECK(input_policy_digest ~ '^[0-9a-f]{64}$'),
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    `CREATE TABLE staffing_finance_policy_payloads(decision_id uuid PRIMARY KEY REFERENCES staffing_finance_policy_decisions(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    scoped('staffing_scenarios', `customer_id uuid NOT NULL, engagement_id uuid NOT NULL,
      baseline_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      dependency_digest text NOT NULL CHECK(dependency_digest ~ '^[0-9a-f]{64}$'),
      formula_version text NOT NULL CHECK(formula_version='staffing-economics-v1'),
      from_date date NOT NULL, to_date date NOT NULL, as_of timestamptz NOT NULL,
      policy_decision_id uuid, created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       FOREIGN KEY(policy_decision_id,environment_id,workspace_id) REFERENCES staffing_finance_policy_decisions(id,environment_id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date BETWEEN from_date AND from_date+90 AND to_date<=DATE '2100-12-31')`),
    scoped('staffing_scenario_inputs', `scenario_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('allocation','rate','revenue','nonlabor','calendar','source','demand')),
      input_id uuid NOT NULL, input_revision_id uuid NOT NULL,
      input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'), generation bigint NOT NULL CHECK(generation>=1),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(scenario_id,kind,input_revision_id), FOREIGN KEY(scenario_id,environment_id,workspace_id) REFERENCES staffing_scenarios(id,environment_id,workspace_id)`),
    `CREATE TABLE staffing_scenario_payloads(scenario_id uuid PRIMARY KEY REFERENCES staffing_scenarios(id),
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072));`,
    scoped('staffing_conversation_bindings', `conversation_id uuid NOT NULL UNIQUE,
      owner_membership_id uuid NOT NULL, customer_id uuid NOT NULL, workload_id uuid,
      demand_id uuid NOT NULL, demand_revision_id uuid NOT NULL,
      mode text NOT NULL CHECK(mode IN ('operational','finance')), scenario_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(id,conversation_id,owner_membership_id), FOREIGN KEY(conversation_id) REFERENCES conversations(id),
       FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
       FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id),
       FOREIGN KEY(demand_id,environment_id,workspace_id,customer_id) REFERENCES staffing_demands(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(demand_revision_id,demand_id) REFERENCES staffing_demand_revisions(id,demand_id),
       FOREIGN KEY(scenario_id,environment_id,workspace_id) REFERENCES staffing_scenarios(id,environment_id,workspace_id),
       CHECK(mode='finance' OR scenario_id IS NULL)`),
    scoped('staffing_advisory_attempts', `binding_id uuid NOT NULL, conversation_id uuid NOT NULL,
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
      owner_membership_id uuid NOT NULL, native_request_id uuid, response_id text,
      response_attempt_id uuid UNIQUE REFERENCES response_attempts(id),
      state text NOT NULL DEFAULT 'prepared' CHECK(state IN ('prepared','running','completed','failed','cancelled','expired','unconfirmed')),
      dispatch_at timestamptz, deadline_at timestamptz, settled_at timestamptz,
      read_calls integer NOT NULL DEFAULT 0 CHECK(read_calls BETWEEN 0 AND 6),
      model_steps integer NOT NULL DEFAULT 0 CHECK(model_steps BETWEEN 0 AND 6),
      context_bytes integer NOT NULL DEFAULT 0 CHECK(context_bytes BETWEEN 0 AND 24576),
      dependency_count integer NOT NULL DEFAULT 0 CHECK(dependency_count BETWEEN 0 AND 200),
      failure_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(binding_id,request_key), UNIQUE(native_request_id),
       FOREIGN KEY(binding_id,environment_id,workspace_id) REFERENCES staffing_conversation_bindings(id,environment_id,workspace_id),
       FOREIGN KEY(binding_id,conversation_id,owner_membership_id) REFERENCES staffing_conversation_bindings(id,conversation_id,owner_membership_id),
       FOREIGN KEY(conversation_id) REFERENCES conversations(id),
       FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK((dispatch_at IS NULL AND deadline_at IS NULL) OR (dispatch_at IS NOT NULL AND deadline_at IS NOT NULL
         AND deadline_at>dispatch_at AND deadline_at<=dispatch_at+interval '120 seconds')),
       CHECK(state<>'running' OR (dispatch_at IS NOT NULL AND response_attempt_id IS NOT NULL))`),
    `CREATE UNIQUE INDEX staffing_advisory_one_active ON staffing_advisory_attempts(conversation_id)
      WHERE state IN ('prepared','running');
     CREATE TABLE staffing_advisory_instruction_payloads(attempt_id uuid PRIMARY KEY REFERENCES staffing_advisory_attempts(id),
      instruction text NOT NULL CHECK(length(instruction) BETWEEN 1 AND 8000));`,
    scoped('staffing_advisory_dependencies', `attempt_id uuid NOT NULL, kind text NOT NULL,
      input_id uuid NOT NULL, revision_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation>=1),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(attempt_id,kind,input_id,revision_id),
       FOREIGN KEY(attempt_id,environment_id,workspace_id) REFERENCES staffing_advisory_attempts(id,environment_id,workspace_id)`),
    scoped('staffing_model_step_receipts', `attempt_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6), step_token text NOT NULL CHECK(length(step_token) BETWEEN 1 AND 200),
      admitted_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,step_token),
       FOREIGN KEY(attempt_id,environment_id,workspace_id) REFERENCES staffing_advisory_attempts(id,environment_id,workspace_id)`),
    scoped('staffing_model_step_usage_receipts', `step_receipt_id uuid NOT NULL,
      native_event_id text NOT NULL CHECK(native_event_id ~ '^evt_[A-Za-z0-9_-]+$'),
      event_type text NOT NULL CHECK(event_type IN ('step.completed','step.failed')),
      input_tokens bigint CHECK(input_tokens BETWEEN 0 AND 9007199254740991),
      output_tokens bigint CHECK(output_tokens BETWEEN 0 AND 9007199254740991),
      emitted_at timestamptz NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(step_receipt_id), UNIQUE(native_event_id),
       FOREIGN KEY(step_receipt_id,environment_id,workspace_id) REFERENCES staffing_model_step_receipts(id,environment_id,workspace_id)`),
    scoped('staffing_advisory_read_receipts', `attempt_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 6), request_key text NOT NULL,
      request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
      tool_name text NOT NULL CHECK(tool_name IN ('read_staffing_demand','match_staffing_resources','read_staffing_capacity','read_staffing_scenario')),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(attempt_id,ordinal), UNIQUE(attempt_id,request_key),
       FOREIGN KEY(attempt_id,environment_id,workspace_id) REFERENCES staffing_advisory_attempts(id,environment_id,workspace_id)`),
    scoped('staffing_skill_load_receipts', `attempt_id uuid NOT NULL,
      request_key text NOT NULL CHECK(length(request_key) BETWEEN 1 AND 200),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      context_bytes integer NOT NULL CHECK(context_bytes BETWEEN 1 AND 24576),
      loaded_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(attempt_id,request_key), FOREIGN KEY(attempt_id,environment_id,workspace_id) REFERENCES staffing_advisory_attempts(id,environment_id,workspace_id)`),
    `CREATE TABLE staffing_advisory_read_payloads(receipt_id uuid PRIMARY KEY REFERENCES staffing_advisory_read_receipts(id),
      result jsonb NOT NULL CHECK(octet_length(result::text)<=24576));
     CREATE INDEX staffing_economic_resource_idx ON staffing_economic_inputs(environment_id,workspace_id,resource_id,kind);
     CREATE INDEX staffing_economic_baseline_idx ON staffing_economic_inputs(environment_id,workspace_id,baseline_id,kind);
     CREATE INDEX staffing_scenario_scope_idx ON staffing_scenarios(environment_id,workspace_id,customer_id,created_at DESC,id DESC);
     CREATE INDEX staffing_advisory_due_idx ON staffing_advisory_attempts(state,deadline_at);
     CREATE INDEX staffing_advisory_dependency_idx ON staffing_advisory_dependencies(kind,input_id,generation);`,
  ].join('\n'));
  pgm.sql(`CREATE FUNCTION turas_staffing_conversation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM id FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
      IF NOT EXISTS(SELECT 1 FROM conversations c JOIN memberships m ON m.id=NEW.owner_membership_id
        JOIN staffing_demands d ON d.id=NEW.demand_id
        WHERE c.id=NEW.conversation_id AND c.environment_id=NEW.environment_id AND c.workspace_id=NEW.workspace_id
          AND c.customer_id=NEW.customer_id AND c.owner_principal_id=m.principal_id AND m.workspace_id=NEW.workspace_id
          AND m.kind='internal' AND c.context_membership_id=m.id AND c.context_audience='delivery'
          AND c.binding_state='unbound' AND c.eve_session_id IS NULL
          AND d.environment_id=NEW.environment_id AND d.workspace_id=NEW.workspace_id AND d.customer_id=NEW.customer_id
          AND d.workload_id IS NOT DISTINCT FROM NEW.workload_id AND d.current_revision_id=NEW.demand_revision_id AND d.state='qualified')
        OR EXISTS(SELECT 1 FROM submitted_messages WHERE conversation_id=NEW.conversation_id)
        OR EXISTS(SELECT 1 FROM response_attempts WHERE conversation_id=NEW.conversation_id)
        OR EXISTS(SELECT 1 FROM context_snapshot_receipts WHERE conversation_id=NEW.conversation_id)
        OR EXISTS(SELECT 1 FROM planning_conversation_bindings WHERE conversation_id=NEW.conversation_id)
        OR EXISTS(SELECT 1 FROM research_requests WHERE conversation_id=NEW.conversation_id)
        OR (NEW.scenario_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staffing_scenarios s JOIN staffing_demands d ON d.id=NEW.demand_id
          JOIN staffing_demand_revisions v ON v.id=NEW.demand_revision_id
          WHERE s.id=NEW.scenario_id AND s.environment_id=NEW.environment_id AND s.workspace_id=NEW.workspace_id
            AND s.customer_id=NEW.customer_id AND s.engagement_id=d.engagement_id AND s.baseline_id=v.baseline_id)) THEN
        RAISE EXCEPTION 'staffing binding requires a fresh same-scope conversation' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER staffing_conversation_scope BEFORE INSERT ON staffing_conversation_bindings
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_conversation_scope();
    CREATE FUNCTION turas_staffing_deny_mixed_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      PERFORM id FROM conversations WHERE id=NEW.conversation_id FOR UPDATE;
      IF EXISTS(SELECT 1 FROM staffing_conversation_bindings WHERE conversation_id=NEW.conversation_id) THEN
        RAISE EXCEPTION 'conversation has an immutable staffing binding' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER a_planning_no_staffing_binding BEFORE INSERT ON planning_conversation_bindings
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_deny_mixed_conversation();
    CREATE TRIGGER research_no_staffing_binding BEFORE INSERT ON research_requests
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_deny_mixed_conversation();`);
  for (const name of ['staffing_economic_inputs','staffing_advisory_attempts']) {
    pgm.sql(`CREATE TRIGGER ${name}_scope BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_scope_immutable();`);
  }
  pgm.sql(`CREATE TRIGGER staffing_economic_inputs_binding BEFORE UPDATE ON staffing_economic_inputs
    FOR EACH ROW EXECUTE FUNCTION turas_staffing_binding_immutable('kind','resource_id','customer_id',
      'engagement_id','baseline_id','created_by_membership_id');`);
  pgm.sql(`CREATE TRIGGER staffing_advisory_identity BEFORE UPDATE ON staffing_advisory_attempts
    FOR EACH ROW EXECUTE FUNCTION turas_staffing_binding_immutable('binding_id','conversation_id',
      'request_key','request_digest','owner_membership_id','created_at');
    CREATE FUNCTION turas_staffing_advisory_progress() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='UPDATE' THEN
      IF (OLD.dispatch_at IS NOT NULL AND NEW.dispatch_at IS DISTINCT FROM OLD.dispatch_at)
        OR (OLD.deadline_at IS NOT NULL AND NEW.deadline_at IS DISTINCT FROM OLD.deadline_at)
        OR (OLD.native_request_id IS NOT NULL AND NEW.native_request_id IS DISTINCT FROM OLD.native_request_id)
        OR (OLD.response_id IS NOT NULL AND NEW.response_id IS DISTINCT FROM OLD.response_id)
        OR (OLD.response_attempt_id IS NOT NULL AND NEW.response_attempt_id IS DISTINCT FROM OLD.response_attempt_id)
        OR NEW.read_calls<OLD.read_calls OR NEW.model_steps<OLD.model_steps
        OR NEW.context_bytes<OLD.context_bytes OR NEW.dependency_count<OLD.dependency_count
        OR ((NEW.read_calls>OLD.read_calls OR NEW.model_steps>OLD.model_steps) AND (OLD.state<>'running' OR NEW.state<>'running'))
        OR (OLD.state NOT IN ('prepared','running') AND (NEW.context_bytes>OLD.context_bytes OR NEW.dependency_count>OLD.dependency_count))
        OR (NEW.state IS DISTINCT FROM OLD.state AND NOT (
          (OLD.state='prepared' AND NEW.state IN ('running','failed','cancelled','expired','unconfirmed'))
          OR (OLD.state='running' AND NEW.state IN ('completed','failed','cancelled','expired','unconfirmed'))
          OR (OLD.state='unconfirmed' AND NEW.state IN ('completed','failed','cancelled','expired')))) THEN
        RAISE EXCEPTION 'staffing advisory progress cannot reset identity, budgets or terminal state' USING ERRCODE='23514';
      END IF;
      END IF;
      IF TG_OP='INSERT' AND (NEW.state<>'prepared' OR NEW.read_calls<>0 OR NEW.model_steps<>0 OR NEW.dependency_count<>0) THEN
        RAISE EXCEPTION 'staffing advisory must begin with a prepared request' USING ERRCODE='23514';
      END IF;
      IF NEW.response_attempt_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM response_attempts a
        JOIN conversations c ON c.id=a.conversation_id JOIN memberships m ON m.id=NEW.owner_membership_id
        WHERE a.id=NEW.response_attempt_id AND a.conversation_id=NEW.conversation_id
          AND c.environment_id=NEW.environment_id AND c.workspace_id=NEW.workspace_id AND c.owner_principal_id=m.principal_id) THEN
        RAISE EXCEPTION 'staffing advisory native response scope differs' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER staffing_advisory_progress BEFORE INSERT OR UPDATE ON staffing_advisory_attempts
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_advisory_progress();`);
  for (const name of ['staffing_economic_input_revisions','staffing_finance_policy_decisions',
    'staffing_scenarios','staffing_scenario_inputs','staffing_conversation_bindings',
    'staffing_advisory_dependencies','staffing_model_step_receipts','staffing_model_step_usage_receipts','staffing_advisory_read_receipts','staffing_skill_load_receipts']) {
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
  for (const name of ['staffing_economic_input_payloads','staffing_finance_policy_payloads',
    'staffing_scenario_payloads','staffing_advisory_instruction_payloads','staffing_advisory_read_payloads']) {
    pgm.sql(`CREATE TRIGGER ${name}_no_update BEFORE UPDATE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
};
