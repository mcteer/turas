exports.up = pgm => {
  const digest = `CHECK(content_digest ~ '^[a-f0-9]{64}$')`;
  pgm.sql(`
    CREATE TABLE support_scopes (
      id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL, workload_id uuid,
      generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE NULLS NOT DISTINCT(environment_id,workspace_id,customer_id,workload_id),
      UNIQUE(id,environment_id,workspace_id,customer_id), UNIQUE(id,environment_id,workspace_id),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id)
    );
    CREATE TABLE support_records (
      id uuid PRIMARY KEY, scope_id uuid NOT NULL, environment_id text NOT NULL,
      workspace_id uuid NOT NULL, customer_id uuid NOT NULL,
      kind text NOT NULL CHECK(kind IN ('assessment','action')),
      audience text NOT NULL CHECK(audience IN ('internal','delivery')),
      author_membership_id uuid NOT NULL, current_revision_id uuid, accepted_revision_id uuid,
      version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
      state text NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed','accepted','rejected','withdrawn')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(id,scope_id), UNIQUE(id,workspace_id), UNIQUE(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(scope_id,environment_id,workspace_id,customer_id) REFERENCES support_scopes(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE UNIQUE INDEX support_one_assessment ON support_records(scope_id,audience) WHERE kind='assessment';
    CREATE TABLE support_revisions (
      id uuid PRIMARY KEY, record_id uuid NOT NULL, scope_id uuid NOT NULL,
      author_membership_id uuid NOT NULL, workspace_id uuid NOT NULL,
      ordinal bigint NOT NULL CHECK(ordinal BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL ${digest}, source_state_digest text NOT NULL CHECK(source_state_digest ~ '^[a-f0-9]{64}$'),
      contract_version text NOT NULL CHECK(contract_version='support-v1'),
      disposition text CHECK(disposition IN ('open','in_progress','blocked','deferred','completed','dismissed')),
      selected_engagement_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(selected_engagement_ids)<=10),
      created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(record_id,ordinal), UNIQUE(id,record_id), UNIQUE(id,scope_id),
      FOREIGN KEY(record_id,scope_id) REFERENCES support_records(id,scope_id),
      FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY(record_id,workspace_id) REFERENCES support_records(id,workspace_id)
    );
    CREATE TABLE support_payloads (
      revision_id uuid PRIMARY KEY REFERENCES support_revisions(id), content_digest text NOT NULL ${digest},
      content jsonb NOT NULL CHECK(jsonb_typeof(content)='object' AND octet_length(content::text)<=65536)
    );
    CREATE TABLE support_source_dependencies (
      revision_id uuid NOT NULL REFERENCES support_revisions(id), source_key uuid NOT NULL,
      source_kind text NOT NULL CHECK(source_kind IN ('accepted_profile','approved_excerpt','verified_research','shared_knowledge','execution_record','milestone_baseline')),
      source_id uuid NOT NULL, source_revision_id uuid NOT NULL,
      generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL ${digest}, locator jsonb, engagement_id uuid, baseline_id uuid,
      PRIMARY KEY(revision_id,source_kind,source_revision_id), UNIQUE(revision_id,source_key),
      CHECK(source_kind NOT IN ('execution_record','milestone_baseline') OR engagement_id IS NOT NULL)
    );
    CREATE INDEX support_sources_reverse ON support_source_dependencies(source_kind,source_revision_id,generation);
    CREATE TABLE support_review_decisions (
      id uuid PRIMARY KEY, record_id uuid NOT NULL, revision_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL, workspace_id uuid NOT NULL,
      decision text NOT NULL CHECK(decision IN ('accept','reject','withdraw')),
      source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
      expected_version bigint NOT NULL CHECK(expected_version BETWEEN 1 AND 9007199254740991),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(revision_id,record_id) REFERENCES support_revisions(id,record_id),
      FOREIGN KEY(record_id,workspace_id) REFERENCES support_records(id,workspace_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE support_decision_payloads (
      decision_id uuid PRIMARY KEY REFERENCES support_review_decisions(id),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000)
    );
    CREATE TABLE support_review_previews (
      id uuid PRIMARY KEY, record_id uuid NOT NULL, revision_id uuid NOT NULL, actor_membership_id uuid NOT NULL,
      workspace_id uuid NOT NULL, expected_version bigint NOT NULL CHECK(expected_version>=1),
      source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
      preview_digest text NOT NULL UNIQUE CHECK(preview_digest ~ '^[a-f0-9]{64}$'),
      source_state text NOT NULL CHECK(source_state IN ('current','unavailable')),
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(revision_id,record_id) REFERENCES support_revisions(id,record_id),
      FOREIGN KEY(record_id,workspace_id) REFERENCES support_records(id,workspace_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE support_command_receipts (
      id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, actor_membership_id uuid NOT NULL, request_key uuid NOT NULL,
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),
      operation text NOT NULL CHECK(operation IN ('save_assessment','save_action','review_revision','withdraw_record','save_suggestion')),
      scope_id uuid NOT NULL, record_id uuid NOT NULL, revision_id uuid NOT NULL, decision_id uuid,
      outcome text NOT NULL CHECK(outcome IN ('proposed','accepted','rejected','withdrawn')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(environment_id,workspace_id,actor_membership_id,request_key),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY(scope_id,environment_id,workspace_id) REFERENCES support_scopes(id,environment_id,workspace_id),
      FOREIGN KEY(record_id,scope_id) REFERENCES support_records(id,scope_id),
      FOREIGN KEY(revision_id,record_id) REFERENCES support_revisions(id,record_id),
      FOREIGN KEY(decision_id) REFERENCES support_review_decisions(id)
    );
    CREATE TABLE support_expired_command_keys (
      key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$')
    );
    CREATE TABLE support_invalidations (
      revision_id uuid PRIMARY KEY REFERENCES support_revisions(id),
      cause_generation bigint NOT NULL CHECK(cause_generation>=1), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE support_cleanup_jobs (
      id uuid PRIMARY KEY, revision_id uuid REFERENCES support_revisions(id), decision_id uuid REFERENCES support_review_decisions(id),
      payload_kind text NOT NULL CHECK(payload_kind IN ('revision','decision')),
      content_digest text NOT NULL ${digest}, cause_generation bigint NOT NULL CHECK(cause_generation>=1),
      due_at timestamptz NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','done')),
      lease_token uuid, lease_until timestamptz, attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 10),
      created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
      CHECK((payload_kind='revision' AND revision_id IS NOT NULL AND decision_id IS NULL) OR
        (payload_kind='decision' AND decision_id IS NOT NULL AND revision_id IS NULL)),
      CHECK((state='leased')=(lease_token IS NOT NULL AND lease_until IS NOT NULL))
    );
    CREATE INDEX support_cleanup_due ON support_cleanup_jobs(state,due_at);
    CREATE TABLE support_private_dependencies (
      revision_id uuid NOT NULL REFERENCES support_revisions(id), source_kind text NOT NULL,
      source_revision_id uuid NOT NULL, PRIMARY KEY(revision_id,source_kind,source_revision_id)
    );
    CREATE INDEX support_private_source_reverse ON support_private_dependencies(source_kind,source_revision_id,revision_id);
    CREATE INDEX support_records_list ON support_records(scope_id,audience,kind,created_at,id);
    CREATE INDEX support_revisions_history ON support_revisions(record_id,ordinal DESC);
    ALTER TABLE support_records ADD FOREIGN KEY(current_revision_id,id) REFERENCES support_revisions(id,record_id),
      ADD FOREIGN KEY(accepted_revision_id,id) REFERENCES support_revisions(id,record_id);
  `);
  for (const name of ['support_revisions','support_source_dependencies','support_private_dependencies','support_review_decisions','support_invalidations','support_expired_command_keys'])
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const name of ['support_payloads','support_decision_payloads'])
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_immutable();`);
  for (const [name, fields] of [
    ['support_scopes',['id','environment_id','workspace_id','customer_id','workload_id']],
    ['support_records',['id','scope_id','environment_id','workspace_id','customer_id','kind','audience','author_membership_id']],
  ]) pgm.sql(`CREATE TRIGGER ${name}_identity BEFORE UPDATE OR DELETE ON ${name} FOR EACH ROW EXECUTE FUNCTION turas_execution_identity(${fields.map(f=>`'${f}'`).join(',')});`);
  pgm.sql(`
    CREATE FUNCTION turas_purge_support_payload(p_job uuid,p_lease uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE job public.support_cleanup_jobs%ROWTYPE; target_revision uuid; target_digest text;
    BEGIN
      SELECT * INTO job FROM public.support_cleanup_jobs WHERE id=p_job FOR UPDATE;
      IF NOT FOUND OR job.state<>'leased' OR job.lease_token IS DISTINCT FROM p_lease
        OR job.lease_until<=clock_timestamp() OR job.due_at>clock_timestamp() THEN RETURN false; END IF;
      IF job.payload_kind='revision' THEN
        target_revision:=job.revision_id;
        SELECT content_digest INTO target_digest FROM public.support_payloads WHERE revision_id=target_revision;
      ELSE
        SELECT revision_id INTO target_revision FROM public.support_review_decisions WHERE id=job.decision_id;
        SELECT encode(sha256(convert_to(rationale,'UTF8')),'hex') INTO target_digest
          FROM public.support_decision_payloads WHERE decision_id=job.decision_id;
      END IF;
      IF NOT EXISTS(SELECT 1 FROM public.support_invalidations WHERE revision_id=target_revision
          AND cause_generation=job.cause_generation) THEN RETURN false; END IF;
      IF target_digest IS NOT NULL AND target_digest<>job.content_digest THEN RETURN false; END IF;
      IF job.payload_kind='revision' THEN
        DELETE FROM public.support_payloads WHERE revision_id=job.revision_id AND content_digest=job.content_digest;
      ELSE
        DELETE FROM public.support_decision_payloads WHERE decision_id=job.decision_id;
      END IF;
      UPDATE public.support_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL,completed_at=clock_timestamp()
        WHERE id=job.id;
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_purge_support_payload(uuid,uuid) FROM PUBLIC;
    CREATE FUNCTION turas_expire_support_receipt(p_id uuid,p_hashes text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE receipt public.support_command_receipts%ROWTYPE; identity text; fence text;
    BEGIN
      IF cardinality(p_hashes) NOT BETWEEN 1 AND 32 OR EXISTS(
        SELECT 1 FROM unnest(p_hashes) h WHERE h IS NULL OR h !~ '^[a-f0-9]{64}$') THEN
        RAISE EXCEPTION 'Invalid receipt fence' USING ERRCODE='23514';
      END IF;
      SELECT * INTO receipt FROM public.support_command_receipts WHERE id=p_id;
      IF NOT FOUND THEN RETURN false; END IF;
      identity:=format('[%s,%s,%s,%s]',to_json(receipt.environment_id)::text,
        to_json(receipt.workspace_id::text)::text,to_json(receipt.actor_membership_id::text)::text,
        to_json(receipt.request_key::text)::text);
      PERFORM pg_advisory_xact_lock(hashtextextended('support-command:' ||
        encode(sha256(convert_to(identity,'UTF8')),'hex'),0));
      SELECT * INTO receipt FROM public.support_command_receipts WHERE id=p_id FOR UPDATE;
      IF NOT FOUND OR receipt.created_at>clock_timestamp()-interval '365 days' THEN RETURN false; END IF;
      FOREACH fence IN ARRAY p_hashes LOOP
        INSERT INTO public.support_expired_command_keys(key_hash) VALUES(fence) ON CONFLICT DO NOTHING;
      END LOOP;
      DELETE FROM public.support_command_receipts WHERE id=p_id;
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_expire_support_receipt(uuid,text[]) FROM PUBLIC;
    CREATE FUNCTION turas_minimize_support_audit(p_env text,p_limit integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE affected integer;
    BEGIN
      IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid audit batch' USING ERRCODE='23514'; END IF;
      DELETE FROM public.support_decision_payloads WHERE decision_id IN (
        SELECT d.id FROM public.support_review_decisions d JOIN public.support_records r ON r.id=d.record_id
        JOIN public.support_decision_payloads p ON p.decision_id=d.id
        WHERE r.environment_id=p_env AND d.created_at<=clock_timestamp()-interval '365 days'
        ORDER BY d.created_at,d.id LIMIT p_limit);
      GET DIAGNOSTICS affected=ROW_COUNT;
      DELETE FROM public.support_cleanup_jobs WHERE id IN (
        SELECT j.id FROM public.support_cleanup_jobs j LEFT JOIN public.support_review_decisions d ON d.id=j.decision_id
        JOIN public.support_revisions v ON v.id=COALESCE(j.revision_id,d.revision_id) JOIN public.support_records r ON r.id=v.record_id
        WHERE r.environment_id=p_env AND j.state='done' AND j.completed_at<=clock_timestamp()-interval '365 days'
        ORDER BY j.completed_at,j.id LIMIT p_limit);
      RETURN affected;
    END $$;
    REVOKE ALL ON FUNCTION turas_minimize_support_audit(text,integer) FROM PUBLIC;
  `);
};
exports.down = () => { throw new Error('Support history requires forward repair or matched restore'); };
