exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE artifact_evidence_selections (
      id uuid PRIMARY KEY,
      version_id uuid NOT NULL,
      run_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      author_membership_id uuid NOT NULL,
      lifecycle_generation bigint NOT NULL CHECK (lifecycle_generation >= 1),
      original_digest text NOT NULL CHECK (original_digest ~ '^[0-9a-f]{64}$'),
      ranges jsonb NOT NULL CHECK (jsonb_typeof(ranges) = 'array'
        AND jsonb_array_length(ranges) BETWEEN 1 AND 20),
      excerpt_digest text NOT NULL CHECK (excerpt_digest ~ '^[0-9a-f]{64}$'),
      excerpt_char_count integer NOT NULL CHECK (excerpt_char_count BETWEEN 1 AND 8000),
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      data_category text NOT NULL CHECK (data_category IN
        ('delivery_context','internal_operations','commercial','personnel','other_internal')),
      profile_revision_id uuid,
      submitted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, environment_id, workspace_id, customer_id),
      UNIQUE (id, workspace_id, customer_id),
      UNIQUE (profile_revision_id),
      FOREIGN KEY (run_id, version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_extraction_runs(id, version_id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (author_membership_id, workspace_id)
        REFERENCES memberships(id, workspace_id),
      FOREIGN KEY (profile_revision_id, workspace_id, customer_id)
        REFERENCES profile_revisions(id, workspace_id, customer_id),
      CHECK (audience <> 'delivery' OR data_category = 'delivery_context'),
      CHECK ((profile_revision_id IS NULL) = (submitted_at IS NULL))
    );
    CREATE INDEX artifact_evidence_selections_source_idx
      ON artifact_evidence_selections(version_id, run_id, submitted_at);
    CREATE INDEX artifact_evidence_selections_author_idx
      ON artifact_evidence_selections(author_membership_id, created_at DESC);

    CREATE FUNCTION turas_artifact_selection_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE member_kind text;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        SELECT kind INTO member_kind FROM memberships WHERE id = NEW.author_membership_id;
        IF member_kind = 'partner' AND (NEW.audience <> 'delivery' OR NEW.data_category <> 'delivery_context') THEN
          RAISE EXCEPTION 'partner selection must be delivery context' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.version_id IS DISTINCT FROM OLD.version_id
         OR NEW.run_id IS DISTINCT FROM OLD.run_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id
         OR NEW.author_membership_id IS DISTINCT FROM OLD.author_membership_id
         OR NEW.lifecycle_generation IS DISTINCT FROM OLD.lifecycle_generation
         OR NEW.original_digest IS DISTINCT FROM OLD.original_digest OR NEW.ranges IS DISTINCT FROM OLD.ranges
         OR NEW.excerpt_digest IS DISTINCT FROM OLD.excerpt_digest
         OR NEW.excerpt_char_count IS DISTINCT FROM OLD.excerpt_char_count
         OR NEW.audience IS DISTINCT FROM OLD.audience OR NEW.data_category IS DISTINCT FROM OLD.data_category
         OR (OLD.profile_revision_id IS NOT NULL AND NEW.profile_revision_id IS DISTINCT FROM OLD.profile_revision_id)
         OR (OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS DISTINCT FROM OLD.submitted_at)
      THEN
        RAISE EXCEPTION 'artifact selection is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_selection_immutable BEFORE INSERT OR UPDATE ON artifact_evidence_selections
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_selection_immutable();

    CREATE FUNCTION turas_artifact_selection_ranges_checked() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE range_item jsonb;
    DECLARE unit_ordinal integer;
    DECLARE unit_length integer;
    DECLARE range_start integer;
    DECLARE range_end integer;
    DECLARE prior_ordinal integer := 0;
    DECLARE prior_end integer := 0;
    DECLARE selected_length integer := 0;
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM artifact_versions v JOIN artifact_extraction_runs r
          ON r.version_id=v.id AND r.id=NEW.run_id
        WHERE v.id=NEW.version_id AND v.environment_id=NEW.environment_id
          AND v.workspace_id=NEW.workspace_id AND v.customer_id=NEW.customer_id
          AND v.owner_principal_id=NEW.owner_principal_id
          AND v.state IN ('ready','partial') AND r.state='published'
          AND v.lifecycle_generation=NEW.lifecycle_generation
          AND v.sha256_digest=NEW.original_digest
      ) THEN
        RAISE EXCEPTION 'selection source is not current and published' USING ERRCODE='23514';
      END IF;
      FOR range_item IN SELECT value FROM jsonb_array_elements(NEW.ranges) LOOP
        IF jsonb_typeof(range_item) <> 'object'
           OR NOT (range_item ? 'unitId' AND range_item ? 'start' AND range_item ? 'end') THEN
          RAISE EXCEPTION 'invalid selection range' USING ERRCODE='23514';
        END IF;
        SELECT ordinal,char_length(text) INTO unit_ordinal,unit_length
          FROM artifact_extraction_units
          WHERE id=(range_item->>'unitId')::uuid AND run_id=NEW.run_id
            AND version_id=NEW.version_id AND environment_id=NEW.environment_id
            AND workspace_id=NEW.workspace_id AND customer_id=NEW.customer_id
            AND text IS NOT NULL;
        IF unit_ordinal IS NULL THEN
          RAISE EXCEPTION 'selection unit is unavailable' USING ERRCODE='23514';
        END IF;
        range_start := (range_item->>'start')::integer;
        range_end := (range_item->>'end')::integer;
        IF range_start < 0 OR range_end <= range_start OR range_end > unit_length
           OR unit_ordinal < prior_ordinal
           OR (unit_ordinal = prior_ordinal AND range_start < prior_end) THEN
          RAISE EXCEPTION 'selection range is out of bounds or unordered' USING ERRCODE='23514';
        END IF;
        selected_length := selected_length + range_end - range_start;
        prior_ordinal := unit_ordinal;
        prior_end := range_end;
      END LOOP;
      IF selected_length > 8000 THEN
        RAISE EXCEPTION 'selection range exceeds budget' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_selection_ranges_checked BEFORE INSERT ON artifact_evidence_selections
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_selection_ranges_checked();

    CREATE TABLE artifact_evidence_payloads (
      selection_id uuid PRIMARY KEY REFERENCES artifact_evidence_selections(id),
      excerpt text NOT NULL CHECK (char_length(excerpt) BETWEEN 1 AND 8000),
      source_presentation jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(source_presentation) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION turas_artifact_payload_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'artifact evidence payload is immutable' USING ERRCODE='23514';
      END IF;
      IF TG_OP = 'DELETE' AND NOT EXISTS (
        SELECT 1 FROM artifact_evidence_selections s JOIN artifact_versions v ON v.id=s.version_id
        WHERE s.id=OLD.selection_id AND v.state IN ('deleting','deleted')
      ) THEN
        RAISE EXCEPTION 'artifact evidence payload requires deletion tombstone' USING ERRCODE='23514';
      END IF;
      RETURN OLD;
    END;
    $$;
    CREATE TRIGGER artifact_payload_immutable BEFORE UPDATE OR DELETE ON artifact_evidence_payloads
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_payload_immutable();

    ALTER TABLE profile_evidence_links ADD COLUMN artifact_selection_id uuid;
    ALTER TABLE profile_evidence_links DROP CONSTRAINT profile_evidence_links_check;
    ALTER TABLE profile_evidence_links ADD CONSTRAINT profile_evidence_links_one_support_target
      CHECK (num_nonnulls(source_revision_id,supporting_profile_revision_id,artifact_selection_id) = 1);
    ALTER TABLE profile_evidence_links ADD CONSTRAINT profile_evidence_links_artifact_scope_fk
      FOREIGN KEY (artifact_selection_id,workspace_id,customer_id)
      REFERENCES artifact_evidence_selections(id,workspace_id,customer_id);
    CREATE INDEX profile_evidence_artifact_idx ON profile_evidence_links(artifact_selection_id);

    ALTER TABLE profile_revisions DROP CONSTRAINT profile_revisions_submission_channel_check;
    ALTER TABLE profile_revisions ADD CONSTRAINT profile_revisions_submission_channel_check
      CHECK (submission_channel IN
        ('profile_form','chat_share','agent_proposal','synthetic_bootstrap','artifact_share'));
  `);

  pgm.sql(`
    CREATE TABLE conversation_artifact_refs (
      id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL,
      version_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      detached_at timestamptz,
      UNIQUE (conversation_id, version_id),
      FOREIGN KEY (conversation_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES conversations(id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_versions(id, environment_id, workspace_id, customer_id, owner_principal_id)
    );
    CREATE INDEX conversation_artifact_refs_owner_idx ON conversation_artifact_refs
      (owner_principal_id,customer_id,conversation_id) WHERE detached_at IS NULL;
    CREATE FUNCTION turas_conversation_artifact_ref_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
         OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id
         OR NEW.created_at IS DISTINCT FROM OLD.created_at
      THEN
        RAISE EXCEPTION 'conversation artifact association is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER conversation_artifact_ref_immutable BEFORE UPDATE ON conversation_artifact_refs
      FOR EACH ROW EXECUTE FUNCTION turas_conversation_artifact_ref_immutable();

    ALTER TABLE response_attempts ADD CONSTRAINT response_attempts_artifact_pair_unique
      UNIQUE (id, conversation_id);
    CREATE TABLE artifact_context_receipts (
      id uuid PRIMARY KEY,
      attempt_id uuid NOT NULL UNIQUE,
      conversation_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      contract_version text NOT NULL CHECK (contract_version = 'artifact-context-v1'),
      canonical_request_digest text NOT NULL CHECK (canonical_request_digest ~ '^[0-9a-f]{64}$'),
      native_text_digest text NOT NULL CHECK (native_text_digest ~ '^[0-9a-f]{64}$'),
      injection_digest text NOT NULL CHECK (injection_digest ~ '^[0-9a-f]{64}$'),
      selection_refs jsonb NOT NULL CHECK (jsonb_typeof(selection_refs) = 'array'
        AND jsonb_array_length(selection_refs) BETWEEN 1 AND 5),
      selected_unit_count integer NOT NULL CHECK (selected_unit_count BETWEEN 1 AND 20),
      selected_char_count integer NOT NULL CHECK (selected_char_count BETWEEN 1 AND 12000),
      created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (attempt_id, conversation_id) REFERENCES response_attempts(id, conversation_id),
      FOREIGN KEY (conversation_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES conversations(id, environment_id, workspace_id, customer_id, owner_principal_id)
    );
    CREATE TABLE artifact_context_payloads (
      receipt_id uuid PRIMARY KEY REFERENCES artifact_context_receipts(id),
      envelope text NOT NULL CHECK (char_length(envelope) BETWEEN 1 AND 12000),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE conversation_artifact_dependencies (
      conversation_id uuid NOT NULL,
      version_id uuid NOT NULL,
      run_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      lifecycle_generation bigint NOT NULL CHECK (lifecycle_generation >= 1),
      consumed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (conversation_id,version_id,run_id),
      FOREIGN KEY (conversation_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES conversations(id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (run_id, version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_extraction_runs(id, version_id, environment_id, workspace_id, customer_id, owner_principal_id)
    );
    CREATE INDEX conversation_artifact_dependencies_source_idx
      ON conversation_artifact_dependencies(version_id,conversation_id);
    CREATE FUNCTION turas_artifact_dependency_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'artifact dependency is append-only' USING ERRCODE='23514';
    END;
    $$;
    CREATE TRIGGER artifact_dependency_append_only BEFORE UPDATE OR DELETE ON conversation_artifact_dependencies
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_dependency_append_only();
  `);

  pgm.sql(`
    CREATE TABLE artifact_lifecycle_events (
      id uuid PRIMARY KEY,
      version_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      actor_membership_id uuid,
      actor_principal_id uuid,
      event_type text NOT NULL CHECK (event_type IN
        ('cancel','retry','replace','withdraw','delete','deleted','cleanup_retry')),
      expected_generation bigint NOT NULL CHECK (expected_generation >= 1),
      resulting_generation bigint NOT NULL CHECK (resulting_generation >= expected_generation),
      reason_digest text NOT NULL CHECK (reason_digest ~ '^[0-9a-f]{64}$'),
      reason_char_count integer NOT NULL CHECK (reason_char_count BETWEEN 1 AND 2000),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      command_digest text NOT NULL CHECK (command_digest ~ '^[0-9a-f]{64}$'),
      result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,workspace_id,actor_principal_id,version_id,idempotency_key),
      FOREIGN KEY (version_id,environment_id,workspace_id,customer_id)
        REFERENCES artifact_versions(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY (actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY (actor_principal_id) REFERENCES principals(id),
      CHECK ((actor_membership_id IS NULL) = (actor_principal_id IS NULL))
    );
    CREATE INDEX artifact_lifecycle_events_version_idx ON artifact_lifecycle_events(version_id,created_at DESC);

    CREATE TABLE artifact_cleanup_jobs (
      id uuid PRIMARY KEY,
      version_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      lifecycle_generation bigint NOT NULL CHECK (lifecycle_generation >= 1),
      target_kind text NOT NULL CHECK (target_kind IN
        ('original','staged','extraction','selection','draft','generated_history','native_session')),
      opaque_target_id text NOT NULL CHECK (length(opaque_target_id) BETWEEN 1 AND 200
        AND opaque_target_id !~ '[/[:cntrl:]]'),
      state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','retry','done')),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      lease_token uuid,
      lease_expires_at timestamptz,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      safe_error_code text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      UNIQUE (version_id,lifecycle_generation,target_kind,opaque_target_id),
      FOREIGN KEY (version_id,environment_id,workspace_id,customer_id)
        REFERENCES artifact_versions(id,environment_id,workspace_id,customer_id),
      CHECK ((state = 'leased') = (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)),
      CHECK ((state = 'done') = (completed_at IS NOT NULL))
    );
    CREATE INDEX artifact_cleanup_due_idx ON artifact_cleanup_jobs(next_attempt_at,created_at)
      WHERE state IN ('queued','retry');

    CREATE FUNCTION turas_artifact_lifecycle_transition() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE allowed boolean := false;
    DECLARE destructive boolean := false;
    BEGIN
      IF NEW.state = OLD.state THEN
        IF NEW.lifecycle_generation <> OLD.lifecycle_generation THEN
          RAISE EXCEPTION 'generation requires lifecycle transition' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END IF;
      allowed :=
        (OLD.state = 'quarantined' AND NEW.state IN ('processing','failed','cancelled','withdrawn','deleting')) OR
        (OLD.state = 'processing' AND NEW.state IN ('ready','partial','failed','cancelled','withdrawn','deleting')) OR
        (OLD.state IN ('ready','partial','failed','cancelled') AND NEW.state IN ('processing','withdrawn','deleting')) OR
        (OLD.state = 'withdrawn' AND NEW.state = 'deleting') OR
        (OLD.state = 'deleting' AND NEW.state = 'deleted');
      IF NOT allowed THEN RAISE EXCEPTION 'artifact lifecycle transition denied' USING ERRCODE='23514'; END IF;
      destructive := NEW.state IN ('cancelled','withdrawn','deleting') AND NEW.state <> OLD.state;
      IF (destructive AND NEW.lifecycle_generation <> OLD.lifecycle_generation + 1)
         OR (NOT destructive AND NEW.lifecycle_generation <> OLD.lifecycle_generation) THEN
        RAISE EXCEPTION 'artifact lifecycle generation mismatch' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_lifecycle_transition BEFORE UPDATE OF state,lifecycle_generation ON artifact_versions
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_lifecycle_transition();
  `);
};

exports.down = () => {
  throw new Error("Artifact evidence migration requires forward repair");
};
