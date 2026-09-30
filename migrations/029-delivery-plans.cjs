exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE delivery_plans (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      workload_id uuid,
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      owner_membership_id uuid NOT NULL,
      created_by_membership_id uuid NOT NULL,
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK (aggregate_version >= 1),
      working_revision_id uuid,
      accepted_revision_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id,environment_id,workspace_id,customer_id),
      UNIQUE (id,workspace_id,customer_id),
      FOREIGN KEY (customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY (workload_id,workspace_id,customer_id)
        REFERENCES customer_workloads(id,workspace_id,customer_id),
      FOREIGN KEY (owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY (created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE INDEX delivery_plans_scope_idx ON delivery_plans
      (environment_id,workspace_id,customer_id,updated_at DESC,id DESC);
    CREATE FUNCTION turas_plan_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='DELETE' THEN
        RAISE EXCEPTION 'plan identity is immutable' USING ERRCODE='23514';
      END IF;
      IF (NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.workload_id,
          NEW.audience,NEW.created_by_membership_id,NEW.created_at) IS DISTINCT FROM
         (OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.workload_id,
          OLD.audience,OLD.created_by_membership_id,OLD.created_at) THEN
        RAISE EXCEPTION 'plan scope is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER delivery_plan_scope_immutable BEFORE UPDATE OR DELETE ON delivery_plans
      FOR EACH ROW EXECUTE FUNCTION turas_plan_scope_immutable();

    CREATE TABLE plan_revisions (
      id uuid PRIMARY KEY,
      plan_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK (revision_number >= 1),
      parent_revision_id uuid,
      base_accepted_revision_id uuid,
      author_membership_id uuid NOT NULL,
      template_version text NOT NULL CHECK (template_version='delivery-plan-v1'),
      content_schema_version text NOT NULL CHECK (content_schema_version='plan-content-v1'),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      context_digest text NOT NULL CHECK (context_digest ~ '^[0-9a-f]{64}$'),
      evidence_quality_version text NOT NULL CHECK (evidence_quality_version='evidence-quality-v1'),
      as_of timestamptz NOT NULL CHECK (as_of <= now()),
      origin text NOT NULL CHECK (origin IN ('manual','agent')),
      drafting_attempt_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (plan_id,revision_number),
      UNIQUE (id,plan_id),
      UNIQUE (id,plan_id,environment_id,workspace_id,customer_id),
      UNIQUE (drafting_attempt_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (parent_revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (base_accepted_revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      CHECK ((origin='agent') = (drafting_attempt_id IS NOT NULL)),
      CHECK (revision_number=1 OR parent_revision_id IS NOT NULL)
    );
    ALTER TABLE delivery_plans ADD CONSTRAINT delivery_plan_working_revision_fk
      FOREIGN KEY (working_revision_id,id) REFERENCES plan_revisions(id,plan_id);
    ALTER TABLE delivery_plans ADD CONSTRAINT delivery_plan_accepted_revision_fk
      FOREIGN KEY (accepted_revision_id,id) REFERENCES plan_revisions(id,plan_id);
    CREATE INDEX plan_revisions_plan_time_idx ON plan_revisions
      (plan_id,revision_number DESC,id);

    CREATE TABLE plan_revision_payloads (
      revision_id uuid PRIMARY KEY REFERENCES plan_revisions(id),
      title text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 160),
      content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'
        AND octet_length(content::text) <= 131072),
      change_reason text CHECK (change_reason IS NULL OR
        length(btrim(change_reason)) BETWEEN 1 AND 2000),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE plan_source_dependencies (
      revision_id uuid NOT NULL REFERENCES plan_revisions(id),
      dependency_id uuid NOT NULL,
      source_kind text NOT NULL CHECK (source_kind IN
        ('accepted_profile','approved_excerpt','verified_research','shared_knowledge')),
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
      locator jsonb NOT NULL CHECK (jsonb_typeof(locator)='object'
        AND octet_length(locator::text) <= 2048),
      assertion_keys text[] NOT NULL DEFAULT '{}',
      quality_basis jsonb NOT NULL DEFAULT '{}'::jsonb CHECK
        (jsonb_typeof(quality_basis)='object' AND octet_length(quality_basis::text) <= 4096),
      consumed_by_model boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (revision_id,dependency_id)
    );
    CREATE INDEX plan_source_original_idx ON plan_source_dependencies
      (source_kind,source_revision_id,source_generation);

    CREATE TABLE plan_private_dependencies (
      revision_id uuid NOT NULL REFERENCES plan_revisions(id),
      source_kind text NOT NULL,
      source_revision_id uuid NOT NULL,
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (revision_id,source_kind,source_revision_id,source_generation)
    );
    CREATE INDEX plan_private_original_idx ON plan_private_dependencies
      (source_kind,source_revision_id,source_generation);

    CREATE TABLE plan_revision_events (
      id uuid PRIMARY KEY,
      event_order bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
      plan_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      state text NOT NULL CHECK (state IN
        ('draft','in_review','changes_requested','rejected','accepted','superseded')),
      actor_membership_id uuid,
      operation_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (plan_id,revision_id,id),
      FOREIGN KEY (revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (actor_membership_id) REFERENCES memberships(id)
    );
    CREATE INDEX plan_revision_events_latest_idx ON plan_revision_events
      (revision_id,event_order DESC);
    CREATE TABLE plan_event_payloads (
      event_id uuid PRIMARY KEY REFERENCES plan_revision_events(id),
      rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 2000)
    );

    CREATE FUNCTION turas_plan_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'immutable plan history' USING ERRCODE='23514';
    END;
    $$;
    CREATE TRIGGER plan_revisions_immutable BEFORE UPDATE OR DELETE ON plan_revisions
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_revision_payloads_no_update BEFORE UPDATE ON plan_revision_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_sources_immutable BEFORE UPDATE OR DELETE ON plan_source_dependencies
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_private_sources_immutable BEFORE UPDATE OR DELETE ON plan_private_dependencies
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_events_immutable BEFORE UPDATE OR DELETE ON plan_revision_events
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_event_payloads_no_update BEFORE UPDATE ON plan_event_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
  `);
};

exports.down = () => { throw new Error('Delivery plan history requires forward repair'); };
