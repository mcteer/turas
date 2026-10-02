exports.up = (pgm) => {
  const scoped = (name, fields, constraints = '') => `CREATE TABLE ${name} (
    id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
    workspace_id uuid NOT NULL REFERENCES workspaces(id), ${fields},
    UNIQUE(id,environment_id,workspace_id) ${constraints ? ',' + constraints : ''});`;
  pgm.sql([
    `ALTER TABLE milestone_baselines ADD UNIQUE(id,engagement_id,plan_id,revision_id,content_digest);`,
    scoped('resource_calendars', `resource_id uuid NOT NULL UNIQUE,
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(id,resource_id), FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id)`),
    scoped('resource_calendar_revisions', `calendar_id uuid NOT NULL, resource_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      timezone text NOT NULL, timezone_data_version text NOT NULL,
      from_date date NOT NULL, to_date date NOT NULL, observed_at timestamptz NOT NULL,
      next_review_at timestamptz NOT NULL, actor_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(calendar_id,revision_number), UNIQUE(id,resource_id),
       FOREIGN KEY(calendar_id,resource_id) REFERENCES resource_calendars(id,resource_id),
       FOREIGN KEY(calendar_id,environment_id,workspace_id) REFERENCES resource_calendars(id,environment_id,workspace_id),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date BETWEEN from_date AND from_date+90),
       CHECK(to_date<=DATE '2100-12-31' AND next_review_at>=observed_at)`),
    `CREATE TABLE resource_calendar_payloads(revision_id uuid PRIMARY KEY REFERENCES resource_calendar_revisions(id),
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    scoped('resource_calendar_intervals', `revision_id uuid NOT NULL, resource_id uuid NOT NULL,
      service_date date NOT NULL, kind text NOT NULL CHECK(kind IN ('contracted','holiday','leave','protected')),
      ordinal integer NOT NULL CHECK(ordinal BETWEEN 0 AND 15),
      start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
      local_start text NOT NULL, local_end text NOT NULL, explicit_start_offset text, explicit_end_offset text,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(revision_id,service_date,kind,ordinal), FOREIGN KEY(revision_id,resource_id) REFERENCES resource_calendar_revisions(id,resource_id),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       CHECK(end_at>start_at AND date_trunc('minute',start_at)=start_at AND date_trunc('minute',end_at)=end_at),
       CHECK(kind<>'contracted' OR ordinal<8)`),
    `CREATE TABLE resource_calendar_days(resource_id uuid NOT NULL, service_date date NOT NULL,
      revision_id uuid NOT NULL, PRIMARY KEY(resource_id,service_date),
      FOREIGN KEY(revision_id,resource_id) REFERENCES resource_calendar_revisions(id,resource_id));`,
    scoped('staffing_demands', `customer_id uuid NOT NULL, workload_id uuid, engagement_id uuid NOT NULL,
      created_by_membership_id uuid NOT NULL, current_revision_id uuid,
      state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','qualified','fulfilled','cancelled')),
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(id,environment_id,workspace_id,customer_id), UNIQUE(id,engagement_id,customer_id),
       FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id),
       FOREIGN KEY(created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('staffing_demand_revisions', `demand_id uuid NOT NULL, customer_id uuid NOT NULL,
      engagement_id uuid NOT NULL, baseline_id uuid NOT NULL, plan_id uuid NOT NULL, plan_revision_id uuid NOT NULL,
      baseline_digest text NOT NULL CHECK(baseline_digest ~ '^[0-9a-f]{64}$'), work_package_key text NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'), actor_membership_id uuid NOT NULL,
      from_date date NOT NULL, to_date date NOT NULL, billable boolean NOT NULL,
      total_minutes integer NOT NULL CHECK(total_minutes BETWEEN 1 AND 87360),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(demand_id,revision_number), UNIQUE(id,demand_id),
       FOREIGN KEY(demand_id,engagement_id,customer_id) REFERENCES staffing_demands(id,engagement_id,customer_id),
       FOREIGN KEY(baseline_id,engagement_id,plan_id,plan_revision_id,baseline_digest) REFERENCES milestone_baselines(id,engagement_id,plan_id,revision_id,content_digest),
       FOREIGN KEY(demand_id,environment_id,workspace_id,customer_id) REFERENCES staffing_demands(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
       FOREIGN KEY(plan_id,environment_id,workspace_id,customer_id) REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(plan_revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date BETWEEN from_date AND from_date+90 AND to_date<=DATE '2100-12-31')`),
    `CREATE TABLE staffing_demand_payloads(revision_id uuid PRIMARY KEY REFERENCES staffing_demand_revisions(id),
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));
     ALTER TABLE staffing_demands ADD FOREIGN KEY(current_revision_id,id) REFERENCES staffing_demand_revisions(id,demand_id);`,
    scoped('staffing_demand_events', `demand_id uuid NOT NULL, revision_id uuid NOT NULL,
      aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      state text NOT NULL CHECK(state IN ('draft','qualified','fulfilled','cancelled')),
      action text NOT NULL CHECK(action IN ('create','revise','qualify','cancel','fulfill')),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(demand_id,aggregate_version), FOREIGN KEY(revision_id,demand_id) REFERENCES staffing_demand_revisions(id,demand_id),
       FOREIGN KEY(demand_id,environment_id,workspace_id) REFERENCES staffing_demands(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    `CREATE TABLE staffing_demand_event_payloads(event_id uuid PRIMARY KEY REFERENCES staffing_demand_events(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    `CREATE TABLE staffing_demand_days(demand_id uuid NOT NULL REFERENCES staffing_demands(id),
      service_date date NOT NULL CHECK(service_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
      confirmed_minutes integer NOT NULL DEFAULT 0 CHECK(confirmed_minutes BETWEEN 0 AND 960),
      generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      PRIMARY KEY(demand_id,service_date));`,
    `CREATE TABLE staffing_capacity_days(resource_id uuid NOT NULL REFERENCES workforce_resources(id),
      service_date date NOT NULL CHECK(service_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
      confirmed_minutes integer NOT NULL DEFAULT 0 CHECK(confirmed_minutes BETWEEN 0 AND 960),
      generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      PRIMARY KEY(resource_id,service_date));`,
    scoped('staffing_allocations', `demand_id uuid NOT NULL, customer_id uuid NOT NULL,
      resource_id uuid NOT NULL, created_by_membership_id uuid NOT NULL, current_revision_id uuid,
      confirmed_revision_id uuid, state text NOT NULL DEFAULT 'proposed'
        CHECK(state IN ('proposed','tentative','confirmed','released','cancelled','expired')),
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      reservation_expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(demand_id,environment_id,workspace_id,customer_id) REFERENCES staffing_demands(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('staffing_allocation_revisions', `allocation_id uuid NOT NULL, customer_id uuid NOT NULL,
      demand_id uuid NOT NULL, demand_revision_id uuid NOT NULL, resource_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      resource_timezone text NOT NULL, actor_membership_id uuid NOT NULL,
      from_date date NOT NULL, to_date date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(allocation_id,revision_number), UNIQUE(id,allocation_id), UNIQUE(id,resource_id,demand_id),
       FOREIGN KEY(allocation_id,environment_id,workspace_id,customer_id) REFERENCES staffing_allocations(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(demand_id,environment_id,workspace_id,customer_id) REFERENCES staffing_demands(id,environment_id,workspace_id,customer_id),
       FOREIGN KEY(demand_revision_id,demand_id) REFERENCES staffing_demand_revisions(id,demand_id),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date BETWEEN from_date AND from_date+90 AND to_date<=DATE '2100-12-31')`),
    `CREATE TABLE staffing_allocation_payloads(revision_id uuid PRIMARY KEY REFERENCES staffing_allocation_revisions(id),
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));
     ALTER TABLE staffing_allocations ADD FOREIGN KEY(current_revision_id,id) REFERENCES staffing_allocation_revisions(id,allocation_id);
     ALTER TABLE staffing_allocations ADD FOREIGN KEY(confirmed_revision_id,id) REFERENCES staffing_allocation_revisions(id,allocation_id);`,
    scoped('staffing_allocation_events', `allocation_id uuid NOT NULL, revision_id uuid NOT NULL,
      aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      state text NOT NULL CHECK(state IN ('proposed','tentative','confirmed','released','cancelled','expired')),
      action text NOT NULL CHECK(action IN ('propose','revise','reserve','cancel_proposal','expire')),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'), created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(allocation_id,aggregate_version), FOREIGN KEY(revision_id,allocation_id) REFERENCES staffing_allocation_revisions(id,allocation_id),
       FOREIGN KEY(allocation_id,environment_id,workspace_id) REFERENCES staffing_allocations(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    `CREATE TABLE staffing_allocation_event_payloads(event_id uuid PRIMARY KEY REFERENCES staffing_allocation_events(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    scoped('staffing_reservation_expirations', `allocation_id uuid NOT NULL, revision_id uuid NOT NULL,
      aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      reservation_expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(allocation_id,aggregate_version),
       FOREIGN KEY(revision_id,allocation_id) REFERENCES staffing_allocation_revisions(id,allocation_id),
       FOREIGN KEY(allocation_id,environment_id,workspace_id) REFERENCES staffing_allocations(id,environment_id,workspace_id)`),
    `CREATE TABLE staffing_allocation_days(allocation_id uuid NOT NULL, revision_id uuid NOT NULL,
      resource_id uuid NOT NULL REFERENCES workforce_resources(id), demand_id uuid NOT NULL REFERENCES staffing_demands(id),
      service_date date NOT NULL CHECK(service_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
      minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 960), billable boolean NOT NULL,
      PRIMARY KEY(allocation_id,service_date), FOREIGN KEY(revision_id,allocation_id) REFERENCES staffing_allocation_revisions(id,allocation_id),
      FOREIGN KEY(revision_id,resource_id,demand_id) REFERENCES staffing_allocation_revisions(id,resource_id,demand_id));`,
    scoped('staffing_review_previews', `allocation_id uuid NOT NULL, revision_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      action text NOT NULL CHECK(action IN ('confirm','amend','release','cancel')),
      aggregate_version bigint NOT NULL CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      dependency_digest text NOT NULL CHECK(dependency_digest ~ '^[0-9a-f]{64}$'),
      dependencies jsonb NOT NULL CHECK(jsonb_typeof(dependencies)='object' AND octet_length(dependencies::text)<=131072),
      used_decision_id uuid, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL`,
      `UNIQUE(id,allocation_id,revision_id), FOREIGN KEY(allocation_id,environment_id,workspace_id) REFERENCES staffing_allocations(id,environment_id,workspace_id),
       FOREIGN KEY(revision_id,allocation_id) REFERENCES staffing_allocation_revisions(id,allocation_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes')`),
    scoped('staffing_decisions', `allocation_id uuid NOT NULL, revision_id uuid NOT NULL,
      preview_id uuid NOT NULL UNIQUE, actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      action text NOT NULL CHECK(action IN ('confirm','amend','release','cancel')),
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      dependency_digest text NOT NULL CHECK(dependency_digest ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(allocation_id,environment_id,workspace_id) REFERENCES staffing_allocations(id,environment_id,workspace_id),
       FOREIGN KEY(revision_id,allocation_id) REFERENCES staffing_allocation_revisions(id,allocation_id),
       FOREIGN KEY(preview_id,allocation_id,revision_id) REFERENCES staffing_review_previews(id,allocation_id,revision_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    `CREATE TABLE staffing_decision_payloads(decision_id uuid PRIMARY KEY REFERENCES staffing_decisions(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));
     ALTER TABLE staffing_review_previews ADD FOREIGN KEY(used_decision_id) REFERENCES staffing_decisions(id);`,
    scoped('staffing_command_receipts', `actor_membership_id uuid NOT NULL,
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      action text NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
      result_ids jsonb NOT NULL CHECK(jsonb_typeof(result_ids)='object' AND octet_length(result_ids::text)<=16384),
      customer_id uuid, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(environment_id,workspace_id,actor_membership_id,request_key),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id)`),
    `CREATE TABLE staffing_write_windows(environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, actor_membership_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('write','import','advisory')),
      window_start timestamptz NOT NULL, count integer NOT NULL CHECK(count>=0),
      PRIMARY KEY(environment_id,workspace_id,actor_membership_id,kind,window_start),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));`,
    scoped('staffing_match_results', `demand_id uuid NOT NULL, demand_revision_id uuid NOT NULL,
      input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),
      formula_version text NOT NULL CHECK(formula_version='staffing-matching-v1'),
      as_of timestamptz NOT NULL, expires_at timestamptz NOT NULL,
      dependencies jsonb NOT NULL CHECK(jsonb_typeof(dependencies)='object' AND octet_length(dependencies::text)<=1048576),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(demand_id,environment_id,workspace_id) REFERENCES staffing_demands(id,environment_id,workspace_id),
       FOREIGN KEY(demand_revision_id,demand_id) REFERENCES staffing_demand_revisions(id,demand_id),
       CHECK(expires_at>as_of AND expires_at<=as_of+interval '10 minutes')`),
    `CREATE INDEX staffing_demand_scope_idx ON staffing_demands(environment_id,workspace_id,customer_id,updated_at DESC,id DESC);
     CREATE INDEX staffing_allocation_scope_idx ON staffing_allocations(environment_id,workspace_id,customer_id,state,id);
     CREATE INDEX staffing_allocation_resource_idx ON staffing_allocation_days(resource_id,service_date);
     CREATE INDEX staffing_allocation_demand_idx ON staffing_allocation_days(demand_id,service_date);
     CREATE INDEX staffing_reservation_expiry_idx ON staffing_allocations(state,reservation_expires_at);
     CREATE INDEX staffing_calendar_date_idx ON resource_calendar_days(resource_id,service_date);`,
  ].join('\n'));
  for (const name of ['resource_calendars','staffing_demands','staffing_allocations','staffing_review_previews']) {
    pgm.sql(`CREATE TRIGGER ${name}_scope BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_scope_immutable();`);
  }
  for (const [name, fields] of [
    ['resource_calendars',['resource_id']],
    ['staffing_demands',['customer_id','workload_id','engagement_id','created_by_membership_id']],
    ['staffing_allocations',['customer_id','demand_id','created_by_membership_id']],
    ['staffing_review_previews',['allocation_id','revision_id','actor_membership_id','actor_session_id','action',
      'aggregate_version','content_digest','dependency_digest','dependencies','created_at','expires_at']],
  ]) pgm.sql(`CREATE TRIGGER ${name}_binding BEFORE UPDATE ON ${name}
    FOR EACH ROW EXECUTE FUNCTION turas_staffing_binding_immutable(${fields.map(field => `'${field}'`).join(',')});`);
  pgm.sql(`CREATE FUNCTION turas_staffing_past_allocation_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE resource_zone text;
    BEGIN
      IF TG_OP<>'INSERT' THEN
        SELECT resource_timezone INTO resource_zone FROM staffing_allocation_revisions WHERE id=OLD.revision_id;
        IF OLD.service_date < (clock_timestamp() AT TIME ZONE resource_zone)::date THEN
          RAISE EXCEPTION 'past allocation is immutable' USING ERRCODE='23514';
        END IF;
      END IF;
      IF TG_OP<>'DELETE' THEN
        SELECT resource_timezone INTO resource_zone FROM staffing_allocation_revisions WHERE id=NEW.revision_id;
        IF NEW.service_date < (clock_timestamp() AT TIME ZONE resource_zone)::date THEN
          RAISE EXCEPTION 'retroactive allocation is forbidden' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END IF;
      RETURN OLD;
    END; $$;
    CREATE TRIGGER staffing_allocation_days_past BEFORE INSERT OR UPDATE OR DELETE ON staffing_allocation_days
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_past_allocation_guard();`);
  for (const name of ['resource_calendar_revisions','resource_calendar_intervals','staffing_demand_revisions',
    'staffing_demand_events','staffing_allocation_revisions','staffing_allocation_events','staffing_reservation_expirations','staffing_decisions','staffing_command_receipts','staffing_match_results']) {
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
  for (const name of ['resource_calendar_payloads','staffing_demand_payloads','staffing_demand_event_payloads','staffing_allocation_payloads','staffing_allocation_event_payloads','staffing_decision_payloads']) {
    pgm.sql(`CREATE TRIGGER ${name}_no_update BEFORE UPDATE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
};
