exports.up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION turas_research_queries_valid(queries jsonb) RETURNS boolean
      LANGUAGE sql IMMUTABLE AS $$
        SELECT jsonb_typeof(queries)='array'
          AND jsonb_array_length(queries) <= 4
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(queries) q
            WHERE jsonb_typeof(q) <> 'string'
              OR length(btrim(q #>> '{}')) NOT BETWEEN 1 AND 500
          );
      $$;

    CREATE TABLE research_requests (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL,
      actor_principal_id uuid NOT NULL REFERENCES principals(id),
      login_session_id uuid NOT NULL REFERENCES login_sessions(id),
      conversation_id uuid NOT NULL,
      mode text NOT NULL CHECK (mode IN ('recon','practices','fit')),
      state text NOT NULL DEFAULT 'draft' CHECK
        (state IN ('draft','admitted','consumed','expired','cancelled')),
      revision_number integer NOT NULL DEFAULT 1 CHECK (revision_number >= 1),
      public_fields jsonb NOT NULL CHECK
        (jsonb_typeof(public_fields)='object' AND octet_length(public_fields::text) <= 4096),
      rendered_queries jsonb NOT NULL DEFAULT '[]'::jsonb CHECK
        (turas_research_queries_valid(rendered_queries)),
      admitted_digest text CHECK (admitted_digest IS NULL OR admitted_digest ~ '^[0-9a-f]{64}$'),
      admission_deadline timestamptz,
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,actor_membership_id,idempotency_key),
      UNIQUE (id,environment_id,workspace_id,customer_id,actor_principal_id),
      FOREIGN KEY (customer_id,workspace_id)
        REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY (actor_membership_id,workspace_id)
        REFERENCES memberships(id,workspace_id),
      FOREIGN KEY (conversation_id,environment_id,workspace_id,customer_id,actor_principal_id)
        REFERENCES conversations(id,environment_id,workspace_id,customer_id,owner_principal_id),
      CHECK ((state IN ('admitted','consumed') AND admitted_digest IS NOT NULL
          AND admission_deadline IS NOT NULL)
        OR state IN ('draft','expired','cancelled')),
      CHECK (mode <> 'fit' OR rendered_queries='[]'::jsonb)
    );
    CREATE INDEX research_requests_actor_idx ON research_requests
      (environment_id,actor_membership_id,created_at DESC);

    CREATE TABLE research_runs (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL UNIQUE REFERENCES research_requests(id),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL REFERENCES customer_references(id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      conversation_attempt_id uuid UNIQUE REFERENCES response_attempts(id),
      mode text NOT NULL CHECK (mode IN ('recon','practices','fit')),
      state text NOT NULL DEFAULT 'queued' CHECK
        (state IN ('queued','running','completed','partial','failed','cancelled','unconfirmed')),
      run_deadline timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      searches_used integer NOT NULL DEFAULT 0 CHECK (searches_used BETWEEN 0 AND 4),
      fetches_used integer NOT NULL DEFAULT 0 CHECK (fetches_used BETWEEN 0 AND 8),
      bytes_used bigint NOT NULL DEFAULT 0 CHECK (bytes_used BETWEEN 0 AND 8388608),
      safe_reason_code text CHECK (safe_reason_code IS NULL OR length(safe_reason_code) <= 100),
      cancelled_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (started_at IS NULL OR
        (run_deadline IS NOT NULL AND run_deadline <= started_at + interval '120 seconds'))
    );
    CREATE UNIQUE INDEX research_one_active_principal_idx ON research_runs(actor_membership_id)
      WHERE state IN ('queued','running');
    CREATE INDEX research_runs_workspace_state_idx ON research_runs
      (environment_id,workspace_id,state,created_at DESC);

    CREATE TABLE research_operations (
      id uuid PRIMARY KEY,
      run_id uuid NOT NULL REFERENCES research_runs(id),
      step_key text NOT NULL CHECK (length(step_key) BETWEEN 1 AND 128),
      operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 128),
      kind text NOT NULL CHECK (kind IN ('search','fetch')),
      state text NOT NULL CHECK
        (state IN ('reserved','dispatched','succeeded','failed','unconfirmed')),
      reserved_calls integer NOT NULL DEFAULT 1 CHECK (reserved_calls=1),
      reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes BETWEEN 0 AND 2097152),
      deadline timestamptz NOT NULL,
      provider_receipt_id text CHECK
        (provider_receipt_id IS NULL OR length(provider_receipt_id) BETWEEN 1 AND 200),
      safe_error_code text CHECK (safe_error_code IS NULL OR length(safe_error_code) <= 100),
      dispatched_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (run_id,step_key,operation_key),
      CHECK (state NOT IN ('dispatched','succeeded','failed','unconfirmed') OR
        dispatched_at IS NOT NULL)
    );
    CREATE INDEX research_operations_run_idx ON research_operations(run_id,created_at);

    CREATE TABLE research_observations (
      id uuid PRIMARY KEY,
      run_id uuid NOT NULL REFERENCES research_runs(id),
      operation_id uuid NOT NULL REFERENCES research_operations(id),
      origin text NOT NULL CHECK (origin IN ('independent_discovery','user_submission')),
      requested_url text NOT NULL CHECK
        (length(requested_url) BETWEEN 9 AND 2048 AND requested_url ~ '^https://'),
      canonical_url text NOT NULL CHECK
        (length(canonical_url) BETWEEN 9 AND 2048 AND canonical_url ~ '^https://'),
      redirect_aliases jsonb NOT NULL DEFAULT '[]'::jsonb CHECK
        (jsonb_typeof(redirect_aliases)='array' AND jsonb_array_length(redirect_aliases) <= 3),
      identity_checked boolean NOT NULL,
      scope_checked boolean NOT NULL,
      integrity_checked boolean NOT NULL,
      content_checked boolean NOT NULL,
      body_digest text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
      passage_digest text NOT NULL CHECK (passage_digest ~ '^[0-9a-f]{64}$'),
      passage_text text NOT NULL CHECK (length(passage_text) BETWEEN 1 AND 2000),
      normalized_characters integer NOT NULL CHECK (normalized_characters BETWEEN 1 AND 100000),
      publication_at timestamptz,
      observation_at timestamptz,
      retrieval_at timestamptz NOT NULL,
      date_provenance jsonb NOT NULL CHECK
        (jsonb_typeof(date_provenance)='object' AND octet_length(date_provenance::text) <= 4096),
      content_type text NOT NULL CHECK (length(content_type) BETWEEN 1 AND 200),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (operation_id,canonical_url,passage_digest),
      CHECK (origin <> 'independent_discovery' OR
        (identity_checked AND scope_checked AND integrity_checked AND content_checked))
    );
    CREATE INDEX research_observations_canonical_idx ON research_observations(run_id,canonical_url);

    CREATE TABLE research_observation_payloads (
      observation_id uuid PRIMARY KEY REFERENCES research_observations(id),
      normalized_text text NOT NULL CHECK (length(normalized_text) BETWEEN 1 AND 100000),
      raw_body bytea CHECK (raw_body IS NULL OR octet_length(raw_body) <= 2097152),
      created_at timestamptz NOT NULL DEFAULT now(),
      raw_body_expires_at timestamptz NOT NULL CHECK
        (raw_body_expires_at <= created_at + interval '24 hours')
    );

    CREATE TABLE research_evidence_links (
      id uuid PRIMARY KEY,
      observation_id uuid NOT NULL REFERENCES research_observations(id),
      source_revision_id uuid NOT NULL REFERENCES evidence_source_revisions(id),
      linkage_state text NOT NULL CHECK (linkage_state IN ('attributed','pending_user_submission')),
      checked_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (observation_id,source_revision_id)
    );

    CREATE TABLE research_refresh_observations (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES research_requests(id),
      source_revision_id uuid NOT NULL REFERENCES evidence_source_revisions(id),
      observation_id uuid REFERENCES research_observations(id),
      outcome text NOT NULL CHECK (outcome IN ('unchanged','changed','partial','failed')),
      prior_content_digest text NOT NULL CHECK (prior_content_digest ~ '^[0-9a-f]{64}$'),
      current_content_digest text CHECK
        (current_content_digest IS NULL OR current_content_digest ~ '^[0-9a-f]{64}$'),
      retrieval_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (request_id,source_revision_id),
      CHECK (outcome <> 'unchanged' OR prior_content_digest=current_content_digest)
    );

    CREATE TABLE evidence_conflict_targets (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      scope text NOT NULL CHECK (scope IN ('customer','shared')),
      workspace_id uuid REFERENCES workspaces(id),
      customer_id uuid,
      first_kind text NOT NULL CHECK
        (first_kind IN ('accepted_profile','verified_research','published_shared')),
      first_revision_id uuid NOT NULL,
      second_kind text NOT NULL CHECK
        (second_kind IN ('accepted_profile','verified_research','published_shared')),
      second_revision_id uuid NOT NULL,
      period_start date NOT NULL,
      period_end date NOT NULL,
      state text NOT NULL CHECK (state IN ('flagged','confirmed','resolved','dismissed')),
      version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
      rationale text NOT NULL CHECK (length(btrim(rationale)) BETWEEN 1 AND 2000),
      decision_actor_membership_id uuid REFERENCES memberships(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (customer_id,workspace_id)
        REFERENCES customer_references(id,workspace_id),
      CHECK (period_end >= period_start),
      CHECK ((scope='customer' AND workspace_id IS NOT NULL AND customer_id IS NOT NULL)
        OR (scope='shared' AND workspace_id IS NULL AND customer_id IS NULL
          AND first_kind='published_shared' AND second_kind='published_shared')),
      CHECK (first_revision_id <> second_revision_id OR first_kind <> second_kind)
    );
    CREATE INDEX evidence_conflict_targets_scope_idx ON evidence_conflict_targets
      (environment_id,scope,workspace_id,customer_id,state,updated_at DESC);
  `);
};

exports.down = () => {
  throw new Error('Research receipts and conflicts require forward repair');
};
