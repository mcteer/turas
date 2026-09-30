exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE plan_review_previews (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      plan_id uuid NOT NULL,
      revision_id uuid NOT NULL,
      actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      actor_membership_id uuid NOT NULL,
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      aggregate_version bigint NOT NULL CHECK (aggregate_version >= 1),
      source_state_digest text NOT NULL CHECK (source_state_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL,
      used_decision_id uuid,
      UNIQUE (id,plan_id,revision_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      CHECK (expires_at > created_at AND expires_at <= created_at + interval '10 minutes')
    );
    CREATE INDEX plan_review_previews_expiry_idx ON plan_review_previews(expires_at,id);

    CREATE TABLE engagements (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      workload_id uuid,
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      plan_id uuid NOT NULL UNIQUE,
      active_baseline_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id,plan_id),
      UNIQUE (id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (workload_id,workspace_id,customer_id)
        REFERENCES customer_workloads(id,workspace_id,customer_id)
    );
    CREATE INDEX engagements_scope_idx ON engagements
      (environment_id,workspace_id,customer_id,created_at DESC,id);
    ALTER TABLE delivery_plans ADD COLUMN engagement_id uuid UNIQUE;
    ALTER TABLE delivery_plans ADD CONSTRAINT delivery_plan_engagement_fk
      FOREIGN KEY (engagement_id,id) REFERENCES engagements(id,plan_id);

    CREATE TABLE plan_decisions (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      plan_id uuid NOT NULL,
      revision_id uuid NOT NULL UNIQUE,
      preview_id uuid NOT NULL UNIQUE,
      actor_membership_id uuid NOT NULL,
      actor_principal_id uuid NOT NULL REFERENCES principals(id),
      action text NOT NULL CHECK (action IN ('accept','request_changes','reject')),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      source_state_digest text NOT NULL CHECK (source_state_digest ~ '^[0-9a-f]{64}$'),
      engagement_id uuid,
      baseline_id uuid,
      request_key text NOT NULL CHECK (request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      decided_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id,plan_id,revision_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (preview_id,plan_id,revision_id)
        REFERENCES plan_review_previews(id,plan_id,revision_id),
      FOREIGN KEY (actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY (engagement_id,plan_id) REFERENCES engagements(id,plan_id),
      CHECK ((action='accept') = (engagement_id IS NOT NULL)),
      CHECK ((action='accept') = (baseline_id IS NOT NULL))
    );
    CREATE TABLE plan_decision_payloads (
      decision_id uuid PRIMARY KEY REFERENCES plan_decisions(id),
      rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 2000)
    );
    ALTER TABLE plan_review_previews ADD CONSTRAINT plan_preview_used_decision_fk
      FOREIGN KEY (used_decision_id) REFERENCES plan_decisions(id);

    CREATE TABLE milestone_baselines (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      engagement_id uuid NOT NULL,
      plan_id uuid NOT NULL,
      revision_id uuid NOT NULL UNIQUE,
      baseline_number bigint NOT NULL CHECK (baseline_number >= 1),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      decision_id uuid NOT NULL UNIQUE,
      accepted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (engagement_id,baseline_number),
      UNIQUE (id,engagement_id),
      FOREIGN KEY (engagement_id,environment_id,workspace_id,customer_id)
        REFERENCES engagements(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (plan_id,environment_id,workspace_id,customer_id)
        REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (revision_id,plan_id) REFERENCES plan_revisions(id,plan_id),
      FOREIGN KEY (decision_id,plan_id,revision_id)
        REFERENCES plan_decisions(id,plan_id,revision_id),
      FOREIGN KEY (engagement_id,plan_id) REFERENCES engagements(id,plan_id)
    );
    ALTER TABLE engagements ADD CONSTRAINT engagement_active_baseline_fk
      FOREIGN KEY (active_baseline_id,id) REFERENCES milestone_baselines(id,engagement_id);
    ALTER TABLE plan_decisions ADD CONSTRAINT plan_decision_baseline_fk
      FOREIGN KEY (baseline_id,engagement_id) REFERENCES milestone_baselines(id,engagement_id)
      DEFERRABLE INITIALLY DEFERRED;
    CREATE TABLE milestone_baseline_payloads (
      baseline_id uuid PRIMARY KEY REFERENCES milestone_baselines(id),
      content jsonb NOT NULL CHECK (jsonb_typeof(content)='object'
        AND octet_length(content::text) <= 131072)
    );

    CREATE TRIGGER plan_decisions_immutable BEFORE UPDATE OR DELETE ON plan_decisions
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER plan_decision_payloads_no_update BEFORE UPDATE ON plan_decision_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER milestone_baselines_immutable BEFORE UPDATE OR DELETE ON milestone_baselines
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE TRIGGER milestone_baseline_payloads_no_update BEFORE UPDATE ON milestone_baseline_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_plan_immutable();
    CREATE FUNCTION turas_engagement_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.workload_id,
          NEW.audience,NEW.plan_id) IS DISTINCT FROM
         (OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.workload_id,
          OLD.audience,OLD.plan_id) THEN
        RAISE EXCEPTION 'engagement scope is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER engagement_scope_immutable BEFORE UPDATE ON engagements
      FOR EACH ROW EXECUTE FUNCTION turas_engagement_scope_immutable();
    CREATE FUNCTION turas_engagement_matches_plan() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM delivery_plans plan WHERE plan.id=NEW.plan_id
        AND plan.environment_id=NEW.environment_id
        AND plan.workspace_id=NEW.workspace_id AND plan.customer_id=NEW.customer_id
        AND plan.workload_id IS NOT DISTINCT FROM NEW.workload_id
        AND plan.audience=NEW.audience) THEN
        RAISE EXCEPTION 'engagement and plan scope differ' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER engagement_matches_plan BEFORE INSERT OR UPDATE ON engagements
      FOR EACH ROW EXECUTE FUNCTION turas_engagement_matches_plan();
  `);
};

exports.down = () => { throw new Error('Accepted baselines require forward repair'); };
