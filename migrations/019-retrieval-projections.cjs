exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;

    CREATE TABLE retrieval_sources (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid REFERENCES workspaces(id),
      customer_id uuid,
      workload_id uuid,
      scope text NOT NULL CHECK (scope IN ('customer','shared')),
      source_kind text NOT NULL CHECK (source_kind IN
        ('accepted_profile','approved_excerpt','verified_research','published_shared')),
      source_revision_id uuid NOT NULL,
      audience text NOT NULL CHECK (audience IN ('internal','delivery','shared')),
      projection_contract text NOT NULL CHECK (length(projection_contract) BETWEEN 1 AND 128),
      contract_digest text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      lifecycle_state text NOT NULL DEFAULT 'current' CHECK
        (lifecycle_state IN ('current','retired','tombstoned')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, environment_id),
      UNIQUE (environment_id, source_kind, source_revision_id, audience,
        contract_digest, source_generation),
      FOREIGN KEY (customer_id,workspace_id)
        REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY (workload_id,workspace_id,customer_id)
        REFERENCES customer_workloads(id,workspace_id,customer_id),
      CHECK ((scope='customer' AND workspace_id IS NOT NULL AND customer_id IS NOT NULL
          AND audience IN ('internal','delivery') AND source_kind <> 'published_shared')
        OR (scope='shared' AND workspace_id IS NULL AND customer_id IS NULL
          AND workload_id IS NULL AND audience='shared' AND source_kind='published_shared'))
    );
    CREATE INDEX retrieval_sources_customer_idx ON retrieval_sources
      (environment_id,workspace_id,customer_id,audience,lifecycle_state,source_generation);
    CREATE INDEX retrieval_sources_shared_idx ON retrieval_sources
      (environment_id,lifecycle_state,source_generation) WHERE scope='shared';

    CREATE TABLE retrieval_passages (
      id uuid PRIMARY KEY,
      source_id uuid NOT NULL REFERENCES retrieval_sources(id),
      ordinal integer NOT NULL CHECK (ordinal >= 1),
      passage_digest text NOT NULL CHECK (passage_digest ~ '^[0-9a-f]{64}$'),
      passage_text text NOT NULL CHECK (length(passage_text) BETWEEN 1 AND 2000),
      locators jsonb NOT NULL CHECK
        (jsonb_typeof(locators)='array' AND jsonb_array_length(locators) BETWEEN 1 AND 50),
      extraction_warnings jsonb NOT NULL DEFAULT '[]'::jsonb CHECK
        (jsonb_typeof(extraction_warnings)='array' AND jsonb_array_length(extraction_warnings) <= 10),
      search_vector tsvector GENERATED ALWAYS AS
        (to_tsvector('english'::regconfig,passage_text)) STORED,
      embedding public.vector(1536),
      embedding_state text NOT NULL DEFAULT 'pending' CHECK
        (embedding_state IN ('pending','ready','unavailable','unconfirmed')),
      embedding_contract text CHECK
        (embedding_contract IS NULL OR embedding_contract='embedding-v1'),
      embedded_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (source_id,ordinal),
      UNIQUE (source_id,passage_digest),
      CHECK ((embedding_state='ready') = (embedding IS NOT NULL)),
      CHECK (embedding_state <> 'ready' OR
        (embedding_contract='embedding-v1' AND embedded_at IS NOT NULL))
    );
    CREATE INDEX retrieval_passages_text_idx ON retrieval_passages USING gin(search_vector);
    CREATE INDEX retrieval_passages_source_idx ON retrieval_passages(source_id,ordinal);

    CREATE TABLE retrieval_jobs (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      source_id uuid NOT NULL REFERENCES retrieval_sources(id),
      source_generation bigint NOT NULL CHECK (source_generation >= 1),
      contract_digest text NOT NULL CHECK (contract_digest ~ '^[0-9a-f]{64}$'),
      kind text NOT NULL CHECK (kind IN ('index','invalidate','cleanup')),
      state text NOT NULL DEFAULT 'queued' CHECK
        (state IN ('queued','leased','completed','failed','unconfirmed')),
      attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
      lease_token uuid,
      lease_started_at timestamptz,
      lease_until timestamptz,
      last_error_code text CHECK (last_error_code IS NULL OR length(last_error_code) <= 100),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,source_id,source_generation,contract_digest,kind),
      CHECK ((state='leased' AND lease_token IS NOT NULL AND
          lease_started_at IS NOT NULL AND lease_until IS NOT NULL AND
          lease_until > lease_started_at AND lease_until <= lease_started_at + interval '30 seconds')
        OR (state <> 'leased' AND lease_token IS NULL AND lease_until IS NULL)),
      CHECK (state <> 'leased' OR attempts BETWEEN 1 AND 3)
    );
    CREATE INDEX retrieval_jobs_queue_idx ON retrieval_jobs
      (environment_id,kind,state,created_at) WHERE state IN ('queued','leased');

    CREATE TABLE retrieval_embedding_operations (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      job_id uuid REFERENCES retrieval_jobs(id),
      operation_kind text NOT NULL CHECK (operation_kind IN ('index','query')),
      operation_key text NOT NULL CHECK (length(operation_key) BETWEEN 1 AND 128),
      state text NOT NULL CHECK
        (state IN ('reserved','dispatched','succeeded','failed','unconfirmed')),
      embedding_contract text NOT NULL CHECK (embedding_contract='embedding-v1'),
      model_id text NOT NULL CHECK (length(model_id) BETWEEN 1 AND 200),
      dimensions integer NOT NULL CHECK (dimensions=1536),
      input_characters integer NOT NULL CHECK (input_characters BETWEEN 1 AND 64000),
      provider_receipt_id text CHECK
        (provider_receipt_id IS NULL OR length(provider_receipt_id) BETWEEN 1 AND 200),
      dispatched_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (environment_id,operation_key),
      CHECK ((operation_kind='index' AND job_id IS NOT NULL) OR
        (operation_kind='query' AND job_id IS NULL)),
      CHECK (state NOT IN ('dispatched','succeeded','failed','unconfirmed') OR
        dispatched_at IS NOT NULL)
    );
    CREATE INDEX retrieval_embedding_operations_job_idx ON retrieval_embedding_operations(job_id);
  `);
};

exports.down = () => {
  throw new Error('Retrieval projections require forward repair');
};
