exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations ADD CONSTRAINT conversations_artifact_scope_unique
      UNIQUE (id, environment_id, workspace_id, customer_id, owner_principal_id);

    CREATE TABLE artifacts (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      workload_id uuid,
      owner_principal_id uuid NOT NULL REFERENCES principals(id),
      origin_conversation_id uuid NOT NULL,
      origin text NOT NULL DEFAULT 'manual' CHECK (origin = 'manual'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (customer_id, workspace_id)
        REFERENCES customer_references(id, workspace_id),
      FOREIGN KEY (workload_id, workspace_id, customer_id)
        REFERENCES customer_workloads(id, workspace_id, customer_id),
      FOREIGN KEY (origin_conversation_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES conversations(id, environment_id, workspace_id, customer_id, owner_principal_id)
    );
    CREATE INDEX artifacts_owner_customer_idx ON artifacts
      (environment_id, workspace_id, owner_principal_id, customer_id, created_at DESC);

    CREATE FUNCTION turas_artifact_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.workload_id IS DISTINCT FROM OLD.workload_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id
         OR NEW.origin_conversation_id IS DISTINCT FROM OLD.origin_conversation_id
         OR NEW.origin IS DISTINCT FROM OLD.origin
      THEN
        RAISE EXCEPTION 'artifact scope is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_scope_immutable BEFORE UPDATE ON artifacts
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_scope_immutable();

    CREATE TABLE artifact_versions (
      id uuid PRIMARY KEY,
      artifact_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      version_number integer NOT NULL CHECK (version_number >= 1),
      lifecycle_generation bigint NOT NULL DEFAULT 1 CHECK (lifecycle_generation >= 1),
      filename text NOT NULL CHECK (
        length(filename) BETWEEN 1 AND 255 AND filename = btrim(filename)
        AND position('/' IN filename) = 0 AND position(chr(92) IN filename) = 0
        AND filename !~ '[[:cntrl:]]'
      ),
      declared_type text NOT NULL CHECK (length(declared_type) BETWEEN 1 AND 200),
      actual_size_bytes bigint NOT NULL CHECK (actual_size_bytes BETWEEN 1 AND 10485760),
      sha256_digest text NOT NULL CHECK (sha256_digest ~ '^[0-9a-f]{64}$'),
      object_key text NOT NULL UNIQUE CHECK (object_key ~ '^[0-9a-f]{64}$'),
      detected_format text CHECK (detected_format IS NULL OR detected_format IN
        ('pdf','docx','pptx','xlsx','csv','txt','md','png','jpeg')),
      source_published_on date CHECK (source_published_on IS NULL OR source_published_on <= CURRENT_DATE),
      source_observed_on date CHECK (source_observed_on IS NULL OR source_observed_on <= CURRENT_DATE),
      rights_note text NOT NULL CHECK (length(btrim(rights_note)) BETWEEN 1 AND 500),
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      data_category text NOT NULL CHECK (data_category IN
        ('delivery_context','internal_operations','commercial','personnel','other_internal')),
      state text NOT NULL DEFAULT 'quarantined' CHECK (state IN
        ('quarantined','processing','ready','partial','failed','cancelled','withdrawn','deleting','deleted')),
      safe_error_code text,
      submitted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (artifact_id, version_number),
      UNIQUE (id, environment_id, workspace_id, customer_id),
      UNIQUE (id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (artifact_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifacts(id, environment_id, workspace_id, customer_id, owner_principal_id),
      CHECK (audience <> 'delivery' OR data_category = 'delivery_context')
    );
    CREATE INDEX artifact_versions_customer_state_idx ON artifact_versions
      (environment_id, workspace_id, customer_id, state, created_at DESC);

    CREATE FUNCTION turas_artifact_version_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.state <> 'quarantined' OR NEW.lifecycle_generation <> 1 THEN
          RAISE EXCEPTION 'new artifact version must be quarantined' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;
      IF NEW.artifact_id IS DISTINCT FROM OLD.artifact_id
         OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id
         OR NEW.version_number IS DISTINCT FROM OLD.version_number
         OR NEW.filename IS DISTINCT FROM OLD.filename
         OR NEW.declared_type IS DISTINCT FROM OLD.declared_type
         OR NEW.actual_size_bytes IS DISTINCT FROM OLD.actual_size_bytes
         OR NEW.sha256_digest IS DISTINCT FROM OLD.sha256_digest
         OR NEW.object_key IS DISTINCT FROM OLD.object_key
         OR NEW.source_published_on IS DISTINCT FROM OLD.source_published_on
         OR NEW.source_observed_on IS DISTINCT FROM OLD.source_observed_on
         OR NEW.rights_note IS DISTINCT FROM OLD.rights_note
         OR NEW.audience IS DISTINCT FROM OLD.audience
         OR NEW.data_category IS DISTINCT FROM OLD.data_category
         OR (OLD.detected_format IS NOT NULL AND NEW.detected_format IS DISTINCT FROM OLD.detected_format)
      THEN
        RAISE EXCEPTION 'artifact version identity is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_version_immutable BEFORE INSERT OR UPDATE ON artifact_versions
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_version_immutable();
  `);

  pgm.sql(`
    CREATE TABLE artifact_workspace_quotas (
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
      committed_bytes bigint NOT NULL DEFAULT 0 CHECK (committed_bytes >= 0),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (environment_id, workspace_id),
      CHECK (reserved_bytes + committed_bytes <= 2147483648)
    );

    CREATE TABLE artifact_upload_batches (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      workload_id uuid,
      owner_principal_id uuid NOT NULL REFERENCES principals(id),
      origin_conversation_id uuid NOT NULL,
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      file_count integer NOT NULL CHECK (file_count BETWEEN 1 AND 5),
      expected_total_bytes bigint NOT NULL CHECK (expected_total_bytes BETWEEN 1 AND 26214400),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, environment_id, workspace_id, customer_id, owner_principal_id),
      UNIQUE (environment_id, workspace_id, owner_principal_id, origin_conversation_id, idempotency_key),
      FOREIGN KEY (origin_conversation_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES conversations(id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (workload_id, workspace_id, customer_id)
        REFERENCES customer_workloads(id, workspace_id, customer_id),
      CHECK (expires_at = created_at + interval '30 minutes')
    );
    CREATE INDEX artifact_upload_batches_rate_idx ON artifact_upload_batches
      (environment_id, workspace_id, owner_principal_id, created_at DESC);

    CREATE TABLE artifact_upload_intents (
      id uuid PRIMARY KEY,
      batch_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      state text NOT NULL DEFAULT 'uploading' CHECK (state IN
        ('uploading','staged','completed','cancelled','expired','failed')),
      expected_name text NOT NULL CHECK (
        length(expected_name) BETWEEN 1 AND 255 AND expected_name = btrim(expected_name)
        AND position('/' IN expected_name) = 0 AND position(chr(92) IN expected_name) = 0
        AND expected_name !~ '[[:cntrl:]]'
      ),
      expected_size_bytes bigint NOT NULL CHECK (expected_size_bytes BETWEEN 1 AND 10485760),
      declared_type text NOT NULL CHECK (length(declared_type) BETWEEN 1 AND 200),
      source_published_on date CHECK (source_published_on IS NULL OR source_published_on <= CURRENT_DATE),
      source_observed_on date CHECK (source_observed_on IS NULL OR source_observed_on <= CURRENT_DATE),
      rights_note text NOT NULL CHECK (length(btrim(rights_note)) BETWEEN 1 AND 500),
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      data_category text NOT NULL CHECK (data_category IN
        ('delivery_context','internal_operations','commercial','personnel','other_internal')),
      staged_key text UNIQUE CHECK (staged_key IS NULL OR staged_key ~ '^[0-9a-f]{64}$'),
      staged_sha256_digest text CHECK (staged_sha256_digest IS NULL OR staged_sha256_digest ~ '^[0-9a-f]{64}$'),
      staged_actual_size_bytes bigint CHECK (staged_actual_size_bytes IS NULL OR staged_actual_size_bytes BETWEEN 1 AND 10485760),
      finalized_object_key text UNIQUE CHECK (finalized_object_key IS NULL OR finalized_object_key ~ '^[0-9a-f]{64}$'),
      version_id uuid,
      reservation_state text NOT NULL DEFAULT 'reserved' CHECK (reservation_state IN ('reserved','converted','released')),
      safe_error_code text,
      completion_receipt jsonb,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (batch_id, ordinal),
      UNIQUE (id, environment_id, workspace_id, customer_id, owner_principal_id),
      UNIQUE (version_id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (batch_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_upload_batches(id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_versions(id, environment_id, workspace_id, customer_id, owner_principal_id),
      CHECK (audience <> 'delivery' OR data_category = 'delivery_context'),
      CHECK ((state = 'completed') = (version_id IS NOT NULL)),
      CHECK ((state IN ('uploading','staged') AND reservation_state = 'reserved')
        OR (state = 'completed' AND reservation_state = 'converted')
        OR (state IN ('cancelled','expired','failed') AND reservation_state = 'released')),
      CHECK ((staged_key IS NULL) = (staged_sha256_digest IS NULL)
        AND (staged_key IS NULL) = (staged_actual_size_bytes IS NULL)),
      CHECK (state NOT IN ('staged','completed') OR staged_key IS NOT NULL),
      CHECK (expires_at = created_at + interval '30 minutes')
    );
    CREATE INDEX artifact_upload_intents_expiry_idx ON artifact_upload_intents
      (state, expires_at) WHERE state IN ('uploading','staged');

    CREATE FUNCTION turas_artifact_version_completed_intent() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM artifact_upload_intents i
        JOIN artifact_upload_batches b ON b.id = i.batch_id
        JOIN artifacts a ON a.id = NEW.artifact_id
        WHERE i.version_id = NEW.id AND i.state = 'completed'
          AND i.environment_id = NEW.environment_id
          AND i.workspace_id = NEW.workspace_id
          AND i.customer_id = NEW.customer_id
          AND i.owner_principal_id = NEW.owner_principal_id
          AND i.staged_sha256_digest = NEW.sha256_digest
          AND i.staged_actual_size_bytes = NEW.actual_size_bytes
          AND i.finalized_object_key = NEW.object_key
          AND i.expected_name = NEW.filename
          AND i.declared_type = NEW.declared_type
          AND i.source_published_on IS NOT DISTINCT FROM NEW.source_published_on
          AND i.source_observed_on IS NOT DISTINCT FROM NEW.source_observed_on
          AND i.rights_note = NEW.rights_note
          AND i.audience = NEW.audience
          AND i.data_category = NEW.data_category
          AND b.origin_conversation_id = a.origin_conversation_id
      ) THEN
        RAISE EXCEPTION 'artifact version requires completed matching intent' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE CONSTRAINT TRIGGER artifact_version_completed_intent
      AFTER INSERT ON artifact_versions DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_version_completed_intent();
  `);

  pgm.sql(`
    CREATE TABLE artifact_extraction_runs (
      id uuid PRIMARY KEY,
      version_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      initiating_principal_id uuid NOT NULL REFERENCES principals(id),
      lifecycle_generation bigint NOT NULL CHECK (lifecycle_generation >= 1),
      original_digest text NOT NULL CHECK (original_digest ~ '^[0-9a-f]{64}$'),
      scan_policy_version text NOT NULL CHECK (length(scan_policy_version) BETWEEN 1 AND 100),
      parser_policy_version text NOT NULL CHECK (length(parser_policy_version) BETWEEN 1 AND 100),
      parser_image_digest text NOT NULL CHECK (parser_image_digest ~ '^[0-9a-f]{64}$'),
      signature_version text,
      state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','leased','published','failed','cancelled')),
      attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number BETWEEN 1 AND 3),
      attempt_token uuid UNIQUE,
      lease_expires_at timestamptz,
      heartbeat_at timestamptz,
      started_at timestamptz,
      deadline_at timestamptz,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      safe_error_code text,
      scan_receipt jsonb CHECK (scan_receipt IS NULL OR jsonb_typeof(scan_receipt) = 'object'),
      coverage jsonb CHECK (coverage IS NULL OR jsonb_typeof(coverage) = 'object'),
      manifest_digest text CHECK (manifest_digest IS NULL OR manifest_digest ~ '^[0-9a-f]{64}$'),
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, version_id),
      UNIQUE (id, version_id, environment_id, workspace_id, customer_id, owner_principal_id),
      FOREIGN KEY (version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_versions(id, environment_id, workspace_id, customer_id, owner_principal_id),
      CHECK ((state = 'leased') = (attempt_token IS NOT NULL AND lease_expires_at IS NOT NULL
        AND heartbeat_at IS NOT NULL AND started_at IS NOT NULL AND deadline_at IS NOT NULL)
        OR state IN ('published','failed','cancelled')),
      CHECK (deadline_at IS NULL OR deadline_at = started_at + interval '120 seconds'),
      CHECK (lease_expires_at IS NULL OR lease_expires_at <= heartbeat_at + interval '30 seconds'),
      CHECK (state <> 'published' OR (scan_receipt IS NOT NULL AND coverage IS NOT NULL
        AND manifest_digest IS NOT NULL AND published_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX artifact_one_published_run_idx ON artifact_extraction_runs(version_id)
      WHERE state = 'published';
    CREATE UNIQUE INDEX artifact_one_leased_run_idx ON artifact_extraction_runs(version_id)
      WHERE state = 'leased';
    CREATE UNIQUE INDEX artifact_one_leased_environment_idx ON artifact_extraction_runs(environment_id)
      WHERE state = 'leased';
    CREATE INDEX artifact_extraction_queue_idx ON artifact_extraction_runs
      (next_attempt_at, created_at, id) WHERE state = 'queued';
    CREATE INDEX artifact_extraction_lease_idx ON artifact_extraction_runs
      (lease_expires_at) WHERE state = 'leased';

    CREATE FUNCTION turas_artifact_published_run_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.state = 'published' AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'published extraction is immutable' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_published_run_immutable BEFORE UPDATE ON artifact_extraction_runs
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_published_run_immutable();

    CREATE TABLE artifact_extraction_units (
      id uuid PRIMARY KEY,
      run_id uuid NOT NULL,
      version_id uuid NOT NULL,
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL,
      ordinal integer NOT NULL CHECK (ordinal >= 1),
      locator jsonb NOT NULL CHECK (jsonb_typeof(locator) = 'object'),
      text text CHECK (text IS NULL OR char_length(text) BETWEEN 1 AND 32000),
      origin text NOT NULL CHECK (origin IN ('native','ocr')),
      ocr_confidence numeric(5,2) CHECK (ocr_confidence IS NULL OR ocr_confidence BETWEEN 0 AND 100),
      formula text CHECK (formula IS NULL OR char_length(formula) <= 32000),
      cached_value jsonb,
      hidden boolean NOT NULL DEFAULT false,
      source_start integer CHECK (source_start IS NULL OR source_start >= 0),
      source_end integer CHECK (source_end IS NULL OR source_end >= 1),
      purged_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (run_id, ordinal),
      UNIQUE (id, run_id, version_id, environment_id, workspace_id, customer_id),
      FOREIGN KEY (run_id, version_id, environment_id, workspace_id, customer_id, owner_principal_id)
        REFERENCES artifact_extraction_runs(id, version_id, environment_id, workspace_id, customer_id, owner_principal_id),
      CHECK ((text IS NULL) = (purged_at IS NOT NULL)),
      CHECK (origin = 'ocr' OR ocr_confidence IS NULL),
      CHECK (source_start IS NULL OR source_end IS NULL OR source_end > source_start)
    );
    CREATE INDEX artifact_extraction_units_run_order_idx ON artifact_extraction_units(run_id, ordinal);

    CREATE FUNCTION turas_artifact_unit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE source_state text;
    BEGIN
      IF TG_OP = 'INSERT' THEN
        IF NEW.text IS NULL THEN RAISE EXCEPTION 'published unit requires text' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END IF;
      SELECT v.state INTO source_state FROM artifact_versions v WHERE v.id = OLD.version_id;
      IF TG_OP = 'DELETE' THEN
        IF source_state NOT IN ('deleting','deleted') THEN
          RAISE EXCEPTION 'published unit is immutable' USING ERRCODE='23514';
        END IF;
        RETURN OLD;
      END IF;
      IF NEW.id IS DISTINCT FROM OLD.id OR NEW.run_id IS DISTINCT FROM OLD.run_id
         OR NEW.version_id IS DISTINCT FROM OLD.version_id OR NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id OR NEW.ordinal IS DISTINCT FROM OLD.ordinal
         OR NEW.locator IS DISTINCT FROM OLD.locator OR NEW.origin IS DISTINCT FROM OLD.origin
         OR NEW.ocr_confidence IS DISTINCT FROM OLD.ocr_confidence
         OR NEW.source_start IS DISTINCT FROM OLD.source_start OR NEW.source_end IS DISTINCT FROM OLD.source_end
      THEN
        RAISE EXCEPTION 'published unit identity is immutable' USING ERRCODE='23514';
      END IF;
      IF source_state NOT IN ('deleting','deleted') OR NEW.text IS NOT NULL OR NEW.purged_at IS NULL
         OR OLD.purged_at IS NOT NULL OR NEW.formula IS NOT NULL OR NEW.cached_value IS NOT NULL
      THEN
        RAISE EXCEPTION 'unit payload can only be purged after deletion' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_unit_immutable BEFORE INSERT OR UPDATE OR DELETE ON artifact_extraction_units
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_unit_immutable();

    CREATE FUNCTION turas_artifact_ready_requires_publication() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.state IN ('ready','partial') AND OLD.state IS DISTINCT FROM NEW.state AND
         NOT EXISTS (SELECT 1 FROM artifact_extraction_runs r WHERE r.version_id = NEW.id
           AND r.state = 'published' AND r.scan_receipt IS NOT NULL AND r.coverage IS NOT NULL
           AND r.manifest_digest IS NOT NULL) THEN
        RAISE EXCEPTION 'ready artifact requires published extraction' USING ERRCODE='23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER artifact_ready_requires_publication BEFORE UPDATE OF state ON artifact_versions
      FOR EACH ROW EXECUTE FUNCTION turas_artifact_ready_requires_publication();
  `);
};

exports.down = () => {
  throw new Error("Artifact ingestion migration requires forward repair");
};
