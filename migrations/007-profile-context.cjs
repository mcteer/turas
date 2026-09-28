exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE customer_profile_state (
      customer_id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
      internal_generation bigint NOT NULL DEFAULT 0 CHECK (internal_generation >= 0),
      delivery_generation bigint NOT NULL DEFAULT 0 CHECK (delivery_generation >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (customer_id, workspace_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id)
    );
    CREATE FUNCTION turas_new_customer_profile_state() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      INSERT INTO customer_profile_state(customer_id,workspace_id)
        VALUES (NEW.id,NEW.workspace_id) ON CONFLICT (customer_id) DO NOTHING;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER new_customer_profile_state AFTER INSERT ON customer_references
      FOR EACH ROW EXECUTE FUNCTION turas_new_customer_profile_state();
    CREATE TABLE customer_workloads (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      display_name text NOT NULL DEFAULT 'Pending workload' CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
      lifecycle text NOT NULL DEFAULT 'active' CHECK (lifecycle IN ('active','merged')),
      merged_into_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, workspace_id, customer_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (merged_into_id, workspace_id, customer_id) REFERENCES customer_workloads(id, workspace_id, customer_id),
      CHECK (merged_into_id IS NULL OR merged_into_id <> id)
    );
    CREATE INDEX customer_workloads_customer_idx ON customer_workloads(customer_id, lifecycle, id);
    CREATE TABLE customer_stewards (
      customer_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      membership_id uuid NOT NULL,
      active boolean NOT NULL DEFAULT true,
      version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
      assigned_by uuid NOT NULL REFERENCES principals(id),
      assigned_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (customer_id, membership_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (membership_id, workspace_id) REFERENCES memberships(id, workspace_id)
    );
    CREATE FUNCTION turas_steward_internal() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM memberships WHERE id=NEW.membership_id
        AND workspace_id=NEW.workspace_id AND kind='internal' AND active) THEN
        RAISE EXCEPTION 'active internal membership required' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER steward_internal BEFORE INSERT OR UPDATE ON customer_stewards
      FOR EACH ROW EXECUTE FUNCTION turas_steward_internal();

    CREATE TABLE profile_records (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      workload_id uuid,
      kind text NOT NULL CHECK (kind IN ('customer_details','workload_details','stakeholder',
        'product_use','maturity_assessment','risk','engagement_reference','decision',
        'outcome','next_review','claim')),
      canonical_key text,
      version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
      candidate_sequence bigint NOT NULL DEFAULT 0 CHECK (candidate_sequence >= 0),
      current_accepted_revision_id uuid,
      created_by uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, workspace_id, customer_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (workload_id, workspace_id, customer_id) REFERENCES customer_workloads(id, workspace_id, customer_id),
      FOREIGN KEY (created_by, workspace_id) REFERENCES memberships(id, workspace_id),
      CHECK ((kind IN ('customer_details','workload_details','product_use','maturity_assessment')) = (canonical_key IS NOT NULL)),
      CHECK (kind <> 'customer_details' OR (workload_id IS NULL AND canonical_key = 'customer_details')),
      CHECK (kind <> 'workload_details' OR canonical_key = workload_id::text),
      CHECK (kind <> 'maturity_assessment' OR canonical_key = 'maturity_assessment'),
      CHECK (kind <> 'product_use' OR canonical_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
      CHECK (kind <> 'workload_details' OR workload_id IS NOT NULL)
    );
    CREATE UNIQUE INDEX profile_records_canonical_idx ON profile_records
      (workspace_id, customer_id, kind, workload_id, canonical_key) NULLS NOT DISTINCT
      WHERE canonical_key IS NOT NULL;
    CREATE INDEX profile_records_current_idx ON profile_records
      (workspace_id, customer_id, kind, workload_id, created_at, id);
    CREATE TABLE profile_revisions (
      id uuid PRIMARY KEY,
      record_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK (revision_number >= 1),
      base_accepted_revision_id uuid,
      payload_schema_version text NOT NULL,
      payload jsonb NOT NULL CHECK (octet_length(payload::text) <= 32768),
      quality_input jsonb NOT NULL,
      author_membership_id uuid NOT NULL,
      origin text NOT NULL CHECK (origin IN ('manual','authorized_system')),
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      data_category text NOT NULL CHECK (data_category IN
        ('delivery_context','internal_operations','commercial','personnel','other_internal')),
      observed_at timestamptz,
      effective_at timestamptz,
      review_at timestamptz,
      source_references jsonb NOT NULL DEFAULT '[]'::jsonb,
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (record_id, revision_number),
      UNIQUE (id, record_id),
      UNIQUE (id, workspace_id, customer_id),
      FOREIGN KEY (record_id, workspace_id, customer_id) REFERENCES profile_records(id, workspace_id, customer_id),
      FOREIGN KEY (author_membership_id, workspace_id) REFERENCES memberships(id, workspace_id),
      CHECK (audience <> 'delivery' OR data_category = 'delivery_context')
    );
    ALTER TABLE profile_records ADD CONSTRAINT accepted_revision_same_record
      FOREIGN KEY (current_accepted_revision_id, id) REFERENCES profile_revisions(id, record_id);
    CREATE INDEX profile_revisions_author_idx ON profile_revisions
      (author_membership_id, created_at DESC, id);
    CREATE TABLE profile_review_decisions (
      revision_id uuid PRIMARY KEY REFERENCES profile_revisions(id),
      decision text NOT NULL CHECK (decision IN ('accept','reject')),
      reviewer_membership_id uuid NOT NULL REFERENCES memberships(id),
      rationale text NOT NULL CHECK (length(trim(rationale)) BETWEEN 1 AND 2000),
      partner_safe_reason text,
      partner_safe_attestation text,
      decided_at timestamptz NOT NULL DEFAULT now(),
      command_receipt_id uuid NOT NULL
    );
    CREATE FUNCTION turas_accepted_pointer_checked() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.current_accepted_revision_id IS NOT NULL AND
         NEW.current_accepted_revision_id IS DISTINCT FROM OLD.current_accepted_revision_id AND
         NOT EXISTS (
           SELECT 1 FROM profile_revisions v
           LEFT JOIN profile_review_decisions d ON d.revision_id=v.id
           WHERE v.id=NEW.current_accepted_revision_id AND v.record_id=NEW.id
             AND (v.origin='authorized_system' OR d.decision='accept')
         ) THEN
        RAISE EXCEPTION 'accepted pointer requires accepted revision' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER accepted_pointer_checked BEFORE UPDATE OF current_accepted_revision_id ON profile_records
      FOR EACH ROW EXECUTE FUNCTION turas_accepted_pointer_checked();
    CREATE TABLE profile_lifecycle_events (
      id uuid PRIMARY KEY,
      record_id uuid NOT NULL REFERENCES profile_records(id),
      revision_id uuid REFERENCES profile_revisions(id),
      event_type text NOT NULL CHECK (event_type IN ('supersede','retract','identity_merge')),
      previous_head_id uuid REFERENCES profile_revisions(id),
      new_head_id uuid REFERENCES profile_revisions(id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      rationale text NOT NULL,
      command_receipt_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE profile_retraction_requests (
      id uuid PRIMARY KEY,
      accepted_revision_id uuid NOT NULL REFERENCES profile_revisions(id),
      requesting_membership_id uuid NOT NULL REFERENCES memberships(id),
      reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
      state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','resolved','declined')),
      resolving_event_id uuid REFERENCES profile_lifecycle_events(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    );
    CREATE TABLE profile_command_receipts (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL,
      request_key uuid NOT NULL,
      action text NOT NULL,
      payload_digest text NOT NULL CHECK (payload_digest ~ '^[0-9a-f]{64}$'),
      result jsonb NOT NULL,
      status integer NOT NULL CHECK (status BETWEEN 200 AND 299),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (workspace_id, actor_membership_id, request_key),
      FOREIGN KEY (actor_membership_id, workspace_id) REFERENCES memberships(id, workspace_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id)
    );

    CREATE TABLE evidence_sources (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      origin text NOT NULL CHECK (origin IN ('manual','independent_research','authorized_system')),
      canonical_location text NOT NULL,
      creator_membership_id uuid,
      trusted_ingest_identity text,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, workspace_id, customer_id),
      UNIQUE (workspace_id,customer_id,origin,canonical_location),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (creator_membership_id, workspace_id) REFERENCES memberships(id, workspace_id),
      CHECK ((origin = 'independent_research') = (trusted_ingest_identity IS NOT NULL))
    );
    CREATE TABLE evidence_source_revisions (
      id uuid PRIMARY KEY,
      source_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      version bigint NOT NULL CHECK (version >= 1),
      location text NOT NULL,
      title text NOT NULL,
      passage text NOT NULL,
      supported_claim text NOT NULL,
      passage_digest text NOT NULL CHECK (passage_digest ~ '^[0-9a-f]{64}$'),
      publication_at timestamptz,
      observation_at timestamptz,
      event_at timestamptz,
      retrieval_at timestamptz NOT NULL,
      rights text NOT NULL,
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      quality_input jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source_id, version),
      UNIQUE (id, workspace_id, customer_id),
      FOREIGN KEY (source_id, workspace_id, customer_id) REFERENCES evidence_sources(id, workspace_id, customer_id)
    );
    CREATE TABLE evidence_source_events (
      id uuid PRIMARY KEY,
      source_revision_id uuid NOT NULL REFERENCES evidence_source_revisions(id),
      lifecycle_version bigint NOT NULL CHECK (lifecycle_version >= 1),
      event_type text NOT NULL CHECK (event_type IN ('withdraw','supersede')),
      actor_membership_id uuid REFERENCES memberships(id),
      rationale text NOT NULL,
      command_receipt_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source_revision_id, lifecycle_version)
    );
    CREATE TABLE profile_evidence_links (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      profile_revision_id uuid NOT NULL,
      source_revision_id uuid,
      supporting_profile_revision_id uuid,
      support_role text NOT NULL,
      scope_explanation text NOT NULL,
      FOREIGN KEY (profile_revision_id, workspace_id, customer_id) REFERENCES profile_revisions(id, workspace_id, customer_id),
      FOREIGN KEY (source_revision_id, workspace_id, customer_id) REFERENCES evidence_source_revisions(id, workspace_id, customer_id),
      FOREIGN KEY (supporting_profile_revision_id, workspace_id, customer_id) REFERENCES profile_revisions(id, workspace_id, customer_id),
      CHECK ((source_revision_id IS NULL) <> (supporting_profile_revision_id IS NULL)),
      CHECK (profile_revision_id IS DISTINCT FROM supporting_profile_revision_id)
    );
    CREATE INDEX profile_evidence_source_idx ON profile_evidence_links(source_revision_id);
    CREATE TABLE research_checks (
      source_revision_id uuid PRIMARY KEY REFERENCES evidence_source_revisions(id),
      trusted_ingest_identity text NOT NULL,
      check_version text NOT NULL,
      identity_result boolean NOT NULL,
      scope_result boolean NOT NULL,
      integrity_result boolean NOT NULL,
      content_result boolean NOT NULL,
      rationale text NOT NULL,
      checked_at timestamptz NOT NULL DEFAULT now(),
      CHECK (identity_result AND scope_result AND integrity_result AND content_result)
    );
    CREATE TABLE evidence_quality_snapshots (
      id uuid PRIMARY KEY,
      profile_revision_id uuid REFERENCES profile_revisions(id),
      source_revision_id uuid REFERENCES evidence_source_revisions(id),
      rubric_version text NOT NULL,
      rating_actor text NOT NULL,
      input jsonb NOT NULL,
      information_type text NOT NULL,
      date_basis text NOT NULL,
      as_of timestamptz NOT NULL,
      freshness integer NOT NULL CHECK (freshness BETWEEN 0 AND 4),
      score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
      band text NOT NULL CHECK (band IN ('strong','usable','weak','insufficient')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((profile_revision_id IS NULL) <> (source_revision_id IS NULL))
    );
    CREATE TABLE evidence_conflicts (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      first_revision_id uuid NOT NULL,
      second_revision_id uuid NOT NULL,
      state text NOT NULL CHECK (state IN ('flagged','confirmed','resolved')),
      version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
      rationale text NOT NULL,
      resolution_actor_membership_id uuid REFERENCES memberships(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (first_revision_id, workspace_id, customer_id) REFERENCES profile_revisions(id, workspace_id, customer_id),
      FOREIGN KEY (second_revision_id, workspace_id, customer_id) REFERENCES profile_revisions(id, workspace_id, customer_id),
      CHECK (first_revision_id <> second_revision_id)
    );
    CREATE TABLE evidence_conflict_events (
      id uuid PRIMARY KEY,
      conflict_id uuid NOT NULL REFERENCES evidence_conflicts(id),
      version bigint NOT NULL CHECK (version >= 1),
      event_type text NOT NULL CHECK (event_type IN ('flag','confirm','resolve')),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      rationale text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (conflict_id,version)
    );
    CREATE TABLE profile_private_lineage (
      profile_revision_id uuid PRIMARY KEY REFERENCES profile_revisions(id),
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      message_id uuid NOT NULL REFERENCES submitted_messages(id),
      span_digest text NOT NULL CHECK (span_digest ~ '^[0-9a-f]{64}$')
    );
    CREATE TABLE profile_audit_events (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL REFERENCES customer_references(id),
      actor_membership_id uuid REFERENCES memberships(id),
      action text NOT NULL,
      target_id uuid,
      receipt_id uuid,
      transition text,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE FUNCTION turas_profile_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'profile history is append-only' USING ERRCODE='23514';
    END; $$;
    CREATE TRIGGER immutable_profile_revisions BEFORE UPDATE OR DELETE ON profile_revisions
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_profile_review_decisions BEFORE UPDATE OR DELETE ON profile_review_decisions
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_profile_lifecycle BEFORE UPDATE OR DELETE ON profile_lifecycle_events
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_profile_receipts BEFORE UPDATE OR DELETE ON profile_command_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_source_revisions BEFORE UPDATE OR DELETE ON evidence_source_revisions
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_source_events BEFORE UPDATE OR DELETE ON evidence_source_events
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_quality_snapshots BEFORE UPDATE OR DELETE ON evidence_quality_snapshots
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_profile_audit BEFORE UPDATE OR DELETE ON profile_audit_events
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_evidence_links BEFORE UPDATE OR DELETE ON profile_evidence_links
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_research_checks BEFORE UPDATE OR DELETE ON research_checks
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_private_lineage BEFORE UPDATE OR DELETE ON profile_private_lineage
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER immutable_conflict_events BEFORE UPDATE OR DELETE ON evidence_conflict_events
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE FUNCTION turas_source_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.workspace_id,NEW.customer_id,NEW.origin,NEW.canonical_location,
          NEW.creator_membership_id,NEW.trusted_ingest_identity,NEW.created_at) IS DISTINCT FROM
         (OLD.workspace_id,OLD.customer_id,OLD.origin,OLD.canonical_location,
          OLD.creator_membership_id,OLD.trusted_ingest_identity,OLD.created_at) THEN
        RAISE EXCEPTION 'evidence source origin is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER immutable_evidence_source_scope BEFORE UPDATE ON evidence_sources
      FOR EACH ROW EXECUTE FUNCTION turas_source_scope_immutable();

    CREATE FUNCTION turas_profile_record_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF (NEW.workspace_id, NEW.customer_id, NEW.workload_id, NEW.kind, NEW.canonical_key,
        NEW.created_by, NEW.created_at) IS DISTINCT FROM
        (OLD.workspace_id, OLD.customer_id, OLD.workload_id, OLD.kind, OLD.canonical_key,
        OLD.created_by, OLD.created_at) THEN
        RAISE EXCEPTION 'profile record scope is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER immutable_profile_record_scope BEFORE UPDATE ON profile_records
      FOR EACH ROW EXECUTE FUNCTION turas_profile_record_scope_immutable();

    INSERT INTO customer_profile_state(customer_id, workspace_id)
      SELECT id, workspace_id FROM customer_references ON CONFLICT (customer_id) DO NOTHING;
  `);
};
