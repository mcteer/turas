exports.up = pgm => {
  const scope = `id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
    workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL`;
  const end = `UNIQUE(id,environment_id,workspace_id,customer_id,engagement_id),
    FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id)`;
  const table = (name,fields,constraints='') => `CREATE TABLE ${name} (${scope},${fields},${end}${constraints ? ','+constraints : ''});`;
  const fk = (field,parent) => `FOREIGN KEY(${field},environment_id,workspace_id,customer_id,engagement_id) REFERENCES ${parent}(id,environment_id,workspace_id,customer_id,engagement_id)`;
  pgm.sql([
    table('execution_time_entries',`author_membership_id uuid NOT NULL, current_revision_id uuid, approved_revision_id uuid,
      state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','approved','rejected','superseded','reversed')),
      version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991), created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    table('execution_time_revisions',`entry_id uuid NOT NULL, resource_id uuid NOT NULL, author_membership_id uuid NOT NULL, subject_membership_id uuid,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      baseline_id uuid NOT NULL, work_package_key text NOT NULL CHECK(work_package_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
      service_date date NOT NULL, timezone text NOT NULL CHECK(length(timezone) BETWEEN 1 AND 100),
      timezone_version text NOT NULL CHECK(length(timezone_version) BETWEEN 1 AND 100),
      minutes integer NOT NULL CHECK(minutes BETWEEN 1 AND 1440), billable boolean NOT NULL,
      activity_revision_id uuid NOT NULL, allocation_revision_id uuid, content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `${fk('entry_id','execution_time_entries')}, ${fk('activity_revision_id','execution_record_revisions')},
      FOREIGN KEY(subject_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
      FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(allocation_revision_id) REFERENCES staffing_allocation_revisions(id),
      FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(entry_id,revision_number), UNIQUE(id,entry_id)`),
    `CREATE TABLE execution_time_payloads(revision_id uuid PRIMARY KEY REFERENCES execution_time_revisions(id),
      note text NOT NULL CHECK(length(btrim(note)) BETWEEN 1 AND 2000),
      exception_proposals jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(exception_proposals)='object' AND octet_length(exception_proposals::text)<=16384));`,
    table('execution_time_decisions',`entry_id uuid NOT NULL, revision_id uuid NOT NULL,
      action text NOT NULL CHECK(action IN ('submit','approve','reject','reverse')), request_key uuid NOT NULL,
      expected_version bigint NOT NULL CHECK(expected_version>=1), preview_digest text CHECK(preview_digest ~ '^[a-f0-9]{64}$'),
      actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `${fk('entry_id','execution_time_entries')}, ${fk('revision_id','execution_time_revisions')},
      FOREIGN KEY(revision_id,entry_id) REFERENCES execution_time_revisions(id,entry_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(entry_id,request_key)`),
    `CREATE TABLE execution_time_decision_payloads(decision_id uuid PRIMARY KEY REFERENCES execution_time_decisions(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000),
      exceptions jsonb NOT NULL CHECK(jsonb_typeof(exceptions)='object' AND octet_length(exceptions::text)<=16384));`,
    `CREATE TABLE execution_resource_days(environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), resource_id uuid NOT NULL, service_date date NOT NULL,
      timezone text NOT NULL, timezone_version text NOT NULL, approved_minutes integer NOT NULL DEFAULT 0 CHECK(approved_minutes BETWEEN 0 AND 1440),
      generation bigint NOT NULL DEFAULT 0 CHECK(generation BETWEEN 0 AND 9007199254740991),
      PRIMARY KEY(environment_id,workspace_id,resource_id,service_date),
      FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id));`,
    table('execution_actual_days',`entry_id uuid NOT NULL, revision_id uuid NOT NULL, decision_id uuid NOT NULL,
      resource_id uuid NOT NULL, baseline_id uuid NOT NULL, work_package_key text NOT NULL,
      service_date date NOT NULL, minutes integer NOT NULL CHECK(minutes BETWEEN 0 AND 1440),
      billable boolean NOT NULL, approved_at timestamptz NOT NULL DEFAULT now()`,
      `${fk('entry_id','execution_time_entries')}, ${fk('revision_id','execution_time_revisions')}, ${fk('decision_id','execution_time_decisions')},
      FOREIGN KEY(revision_id,entry_id) REFERENCES execution_time_revisions(id,entry_id),
      FOREIGN KEY(environment_id,workspace_id,resource_id,service_date) REFERENCES execution_resource_days(environment_id,workspace_id,resource_id,service_date),
      FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id), UNIQUE(entry_id)`),
    table('execution_actual_package_heads',`baseline_id uuid NOT NULL, work_package_key text NOT NULL,
      generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991), changed_at timestamptz NOT NULL DEFAULT clock_timestamp()`,
      `FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id), UNIQUE(baseline_id,work_package_key)`),
    table('execution_effort_heads',`baseline_id uuid NOT NULL, work_package_key text NOT NULL,
      kind text NOT NULL CHECK(kind IN ('effort_budget','estimate')), revision_id uuid NOT NULL, version bigint NOT NULL DEFAULT 1 CHECK(version>=1)`,
      `${fk('revision_id','execution_record_revisions')}, FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      UNIQUE(baseline_id,work_package_key,kind)`),
    table('execution_calculation_receipts',`generation bigint NOT NULL CHECK(generation>=1), formula_version text NOT NULL CHECK(formula_version='execution-effort-v1'),
      input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'), from_date date NOT NULL, to_date date NOT NULL,
      as_of timestamptz NOT NULL, actor_membership_id uuid NOT NULL`,
      `FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), CHECK(to_date BETWEEN from_date AND from_date+90)`),
    `ALTER TABLE execution_time_entries ADD FOREIGN KEY(current_revision_id,id) REFERENCES execution_time_revisions(id,entry_id),
      ADD FOREIGN KEY(approved_revision_id,id) REFERENCES execution_time_revisions(id,entry_id);
     CREATE INDEX execution_time_list ON execution_time_entries(environment_id,workspace_id,engagement_id,state,created_at,id);
     CREATE INDEX execution_time_subject ON execution_time_revisions(environment_id,workspace_id,resource_id,service_date);
     CREATE INDEX execution_actual_summary ON execution_actual_days(environment_id,workspace_id,engagement_id,service_date);
     CREATE INDEX execution_actual_resource ON execution_actual_days(environment_id,workspace_id,resource_id,service_date);
     CREATE INDEX execution_actual_package ON execution_actual_days(engagement_id,baseline_id,work_package_key,approved_at);`
  ].join('\n'));
  for (const name of ['execution_time_revisions','execution_time_decisions','execution_calculation_receipts'])
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const name of ['execution_time_payloads','execution_time_decision_payloads'])
    pgm.sql(`CREATE TRIGGER ${name}_no_update BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const [name,fields] of [['execution_time_entries',['id','environment_id','workspace_id','customer_id','engagement_id','author_membership_id']],
    ['execution_actual_days',['id','environment_id','workspace_id','customer_id','engagement_id','entry_id']],
    ['execution_actual_package_heads',['id','environment_id','workspace_id','customer_id','engagement_id','baseline_id','work_package_key']],
    ['execution_effort_heads',['id','environment_id','workspace_id','customer_id','engagement_id','baseline_id','work_package_key','kind']],
    ['execution_resource_days',['environment_id','workspace_id','resource_id','service_date','timezone','timezone_version']]])
    pgm.sql(`CREATE TRIGGER ${name}_identity BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_identity(${fields.map(f=>`'${f}'`).join(',')});`);
};
exports.down = () => { throw new Error('Execution history requires forward repair or matched restore'); };
