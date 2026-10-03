exports.up = pgm => {
  const scope = `id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
    workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, engagement_id uuid NOT NULL`;
  const end = `UNIQUE(id,environment_id,workspace_id,customer_id,engagement_id),
    FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id)`;
  const table = (name, fields, constraints='') => `CREATE TABLE ${name} (${scope},${fields},${end}${constraints ? ','+constraints : ''});`;
  const fk = (field, parent) => `FOREIGN KEY(${field},environment_id,workspace_id,customer_id,engagement_id) REFERENCES ${parent}(id,environment_id,workspace_id,customer_id,engagement_id)`;
  const actor = `actor_membership_id uuid NOT NULL, FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`;
  const digest = `content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$')`;
  const positive = `CHECK(version BETWEEN 1 AND 9007199254740991)`;
  pgm.sql([
    table('execution_workspaces',`current_baseline_id uuid NOT NULL, version bigint NOT NULL DEFAULT 1 ${positive},
      generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','closed','review_required')), closeout_revision_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(environment_id,workspace_id,engagement_id), FOREIGN KEY(current_baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id)`),
    table('execution_baseline_bindings',`execution_id uuid NOT NULL, baseline_id uuid NOT NULL,
      bound_at timestamptz NOT NULL DEFAULT now(), ${actor}`,
      `${fk('execution_id','execution_workspaces')}, FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id), UNIQUE(execution_id,baseline_id), UNIQUE(id,baseline_id)`),
    table('execution_baseline_items',`binding_id uuid NOT NULL, baseline_id uuid NOT NULL,
      item_kind text NOT NULL CHECK(item_kind IN ('milestone','work_package')),
      item_key text NOT NULL CHECK(item_key ~ '^[a-z][a-z0-9_-]{0,63}$')`,
      `${fk('binding_id','execution_baseline_bindings')}, FOREIGN KEY(binding_id,baseline_id) REFERENCES execution_baseline_bindings(id,baseline_id),
      UNIQUE(baseline_id,item_kind,item_key), UNIQUE(id,baseline_id,item_kind,item_key)`),
    table('execution_records',`baseline_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('activity','raid','decision','scope_change','effort_budget','estimate','handoff','closeout','outcome')),
      author_membership_id uuid NOT NULL, current_revision_id uuid, accepted_revision_id uuid,
      state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','submitted','accepted','rejected','superseded','retracted')),
      version bigint NOT NULL DEFAULT 1 ${positive}, created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(id,kind)`),
    table('execution_record_revisions',`record_id uuid NOT NULL, kind text NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991), baseline_id uuid NOT NULL,
      audience text NOT NULL CHECK(audience IN ('internal','delivery')), event_date date NOT NULL, timezone text NOT NULL,
      work_package_key text CHECK(work_package_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
      owner_membership_id uuid, ${digest}, created_at timestamptz NOT NULL DEFAULT now(), ${actor}`,
      `${fk('record_id','execution_records')}, FOREIGN KEY(record_id,kind) REFERENCES execution_records(id,kind),
      FOREIGN KEY(baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(record_id,revision_number), UNIQUE(id,record_id)`),
    `CREATE TABLE execution_record_payloads(revision_id uuid PRIMARY KEY REFERENCES execution_record_revisions(id),
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=131072));`,
    `CREATE TABLE execution_closeout_snapshots(revision_id uuid PRIMARY KEY REFERENCES execution_record_revisions(id),
      input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'), inputs jsonb NOT NULL CHECK(jsonb_typeof(inputs)='object' AND octet_length(inputs::text)<=262144));`,
    `CREATE TABLE execution_closeout_invalidations(revision_id uuid PRIMARY KEY REFERENCES execution_closeout_snapshots(revision_id), created_at timestamptz NOT NULL DEFAULT now());
     CREATE INDEX execution_closeout_record_dependencies ON execution_closeout_snapshots USING gin ((inputs->'records') jsonb_path_ops);`,
    table('execution_record_sources',`revision_id uuid NOT NULL, source_kind text NOT NULL CHECK(source_kind IN ('accepted_profile','approved_excerpt','verified_research','shared_knowledge','execution_record','milestone_baseline')),
      source_revision_id uuid NOT NULL, source_generation bigint NOT NULL CHECK(source_generation>=1), ${digest}`,
      `${fk('revision_id','execution_record_revisions')}, UNIQUE(revision_id,source_kind,source_revision_id)`),
    table('execution_review_decisions',`record_id uuid NOT NULL, revision_id uuid NOT NULL,
      action text NOT NULL CHECK(action IN ('accept','reject','retract','submit')),
      expected_version bigint NOT NULL CHECK(expected_version>=1), request_key uuid NOT NULL,
      preview_digest text CHECK(preview_digest ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT now(), ${actor}`,
      `${fk('record_id','execution_records')}, ${fk('revision_id','execution_record_revisions')}, FOREIGN KEY(revision_id,record_id) REFERENCES execution_record_revisions(id,record_id), UNIQUE(record_id,request_key)`),
    `CREATE TABLE execution_review_payloads(decision_id uuid PRIMARY KEY REFERENCES execution_review_decisions(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    table('execution_milestone_heads',`baseline_id uuid NOT NULL, item_kind text NOT NULL DEFAULT 'milestone' CHECK(item_kind='milestone'),
      milestone_key text NOT NULL, state text NOT NULL DEFAULT 'not_started' CHECK(state IN ('not_started','in_progress','blocked','ready_for_review','accepted','waived')),
      current_event_id uuid, version bigint NOT NULL DEFAULT 1 ${positive}`,
      `FOREIGN KEY(baseline_id,item_kind,milestone_key) REFERENCES execution_baseline_items(baseline_id,item_kind,item_key), UNIQUE(baseline_id,milestone_key)`),
    table('execution_milestone_events',`milestone_id uuid NOT NULL, action text NOT NULL CHECK(action IN ('start','block','resume','request_review','accept','waive','reopen')),
      expected_version bigint NOT NULL CHECK(expected_version>=1), evidence_revision_ids uuid[] NOT NULL DEFAULT '{}'
        CHECK(cardinality(evidence_revision_ids)<=20), request_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), ${actor}`,
      `${fk('milestone_id','execution_milestone_heads')}, UNIQUE(id,milestone_id), UNIQUE(milestone_id,request_key), CHECK(action<>'accept' OR cardinality(evidence_revision_ids)>=1)`),
    `CREATE TABLE execution_milestone_payloads(event_id uuid PRIMARY KEY REFERENCES execution_milestone_events(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    table('execution_reconciliations',`old_baseline_id uuid NOT NULL, new_baseline_id uuid NOT NULL, request_key uuid NOT NULL,
      preview_digest text NOT NULL CHECK(preview_digest ~ '^[a-f0-9]{64}$'), rationale_digest text NOT NULL CHECK(rationale_digest ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(), ${actor}`,
      `FOREIGN KEY(old_baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      FOREIGN KEY(new_baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id),
      CHECK(old_baseline_id<>new_baseline_id), UNIQUE(engagement_id,new_baseline_id), UNIQUE(engagement_id,old_baseline_id)`),
    `CREATE TABLE execution_reconciliation_payloads(reconciliation_id uuid PRIMARY KEY REFERENCES execution_reconciliations(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000));`,
    table('execution_reconciliation_items',`reconciliation_id uuid NOT NULL, item_kind text NOT NULL CHECK(item_kind IN ('milestone','work_package')),
      old_key text CHECK(old_key ~ '^[a-z][a-z0-9_-]{0,63}$'), new_key text CHECK(new_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
      disposition text NOT NULL CHECK(disposition IN ('mapped','retired','added'))`,
      `${fk('reconciliation_id','execution_reconciliations')}, UNIQUE(reconciliation_id,item_kind,old_key), UNIQUE(reconciliation_id,item_kind,new_key),
      CHECK((disposition='mapped' AND old_key IS NOT NULL AND new_key IS NOT NULL) OR
        (disposition='retired' AND old_key IS NOT NULL AND new_key IS NULL) OR (disposition='added' AND old_key IS NULL AND new_key IS NOT NULL))`),
    table('execution_command_receipts',`actor_membership_id uuid NOT NULL, request_key uuid NOT NULL, action text NOT NULL,
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'), execution_generation bigint NOT NULL CHECK(execution_generation>=1),
      result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=16384), created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(environment_id,workspace_id,actor_membership_id,request_key)`),
    `CREATE TABLE execution_rate_windows(environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), membership_id uuid NOT NULL,
      bucket text NOT NULL CHECK(bucket IN ('write','review','read','advice')), window_start timestamptz NOT NULL,
      count integer NOT NULL CHECK(count BETWEEN 0 AND 120), PRIMARY KEY(environment_id,workspace_id,membership_id,bucket,window_start),
      FOREIGN KEY(membership_id,workspace_id) REFERENCES memberships(id,workspace_id));`,
    `ALTER TABLE execution_records ADD FOREIGN KEY(current_revision_id,id) REFERENCES execution_record_revisions(id,record_id),
      ADD FOREIGN KEY(accepted_revision_id,id) REFERENCES execution_record_revisions(id,record_id);
     ALTER TABLE execution_workspaces ADD FOREIGN KEY(closeout_revision_id,environment_id,workspace_id,customer_id,engagement_id) REFERENCES execution_record_revisions(id,environment_id,workspace_id,customer_id,engagement_id);
     ALTER TABLE execution_milestone_heads ADD FOREIGN KEY(current_event_id,id) REFERENCES execution_milestone_events(id,milestone_id);
     CREATE INDEX execution_records_list ON execution_records(environment_id,workspace_id,engagement_id,kind,state,created_at,id);
     CREATE INDEX execution_sources_reverse ON execution_record_sources(source_kind,source_revision_id,source_generation);
     CREATE INDEX execution_revisions_order ON execution_record_revisions(record_id,revision_number DESC);
     CREATE INDEX execution_decisions_revision ON execution_review_decisions(revision_id,created_at DESC);`,
    `CREATE FUNCTION turas_execution_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'execution history is immutable' USING ERRCODE='23514'; END $$;
     CREATE FUNCTION turas_execution_identity() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE field text; BEGIN
       IF TG_OP='DELETE' THEN RAISE EXCEPTION 'execution identity is retained' USING ERRCODE='23514'; END IF;
       FOREACH field IN ARRAY TG_ARGV LOOP
         IF to_jsonb(OLD)->field IS DISTINCT FROM to_jsonb(NEW)->field THEN
           RAISE EXCEPTION 'execution identity is immutable' USING ERRCODE='23514'; END IF;
       END LOOP; RETURN NEW; END $$;`
  ].join('\n'));
  for (const name of ['execution_closeout_snapshots','execution_closeout_invalidations','execution_baseline_bindings','execution_baseline_items','execution_record_revisions',
    'execution_record_sources','execution_review_decisions','execution_milestone_events','execution_reconciliations',
    'execution_reconciliation_items','execution_command_receipts']) pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const name of ['execution_record_payloads','execution_review_payloads','execution_milestone_payloads','execution_reconciliation_payloads'])
    pgm.sql(`CREATE TRIGGER ${name}_no_update BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const [name,fields] of [['execution_workspaces',['id','environment_id','workspace_id','customer_id','engagement_id']],
    ['execution_records',['id','environment_id','workspace_id','customer_id','engagement_id','baseline_id','kind','author_membership_id']],
    ['execution_milestone_heads',['id','environment_id','workspace_id','customer_id','engagement_id','baseline_id','milestone_key']]])
    pgm.sql(`CREATE TRIGGER ${name}_identity BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_identity(${fields.map(f=>`'${f}'`).join(',')});`);
};
exports.down = () => { throw new Error('Execution history requires forward repair or matched restore'); };
