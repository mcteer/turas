exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE conversations (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL,
      owner_principal_id uuid NOT NULL REFERENCES principals(id),
      eve_session_id text UNIQUE CHECK (eve_session_id IS NULL OR length(eve_session_id) > 0),
      creation_operation_id uuid NOT NULL UNIQUE,
      binding_state text NOT NULL CHECK (binding_state IN
        ('unbound','creating','reconciling','bound','failed')),
      projection_next_index bigint NOT NULL DEFAULT 0 CHECK (projection_next_index >= 0),
      title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
      revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id),
      CHECK ((binding_state = 'bound') = (eve_session_id IS NOT NULL))
    );
    CREATE INDEX conversations_owner_history_idx
      ON conversations (owner_principal_id, workspace_id, updated_at DESC, id DESC);
    CREATE INDEX conversations_owner_customer_idx
      ON conversations (owner_principal_id, customer_id, updated_at DESC, id DESC);

    CREATE FUNCTION turas_conversation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.environment_id IS DISTINCT FROM OLD.environment_id
         OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.owner_principal_id IS DISTINCT FROM OLD.owner_principal_id
         OR NEW.creation_operation_id IS DISTINCT FROM OLD.creation_operation_id
         OR (OLD.eve_session_id IS NOT NULL AND NEW.eve_session_id IS DISTINCT FROM OLD.eve_session_id)
      THEN
        RAISE EXCEPTION 'conversation association is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER conversation_immutable BEFORE UPDATE ON conversations
      FOR EACH ROW EXECUTE FUNCTION turas_conversation_immutable();

    CREATE TABLE submitted_messages (
      id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      request_key uuid NOT NULL,
      body_digest text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
      text text NOT NULL CHECK (octet_length(text) BETWEEN 1 AND 16384),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (conversation_id, request_key),
      UNIQUE (id, conversation_id)
    );

    CREATE TABLE response_attempts (
      id uuid PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      message_id uuid NOT NULL UNIQUE,
      dispatch_state text NOT NULL CHECK (dispatch_state IN
        ('prepared','dispatching','admitted','uncertain','retryable','rejected')),
      response_state text NOT NULL CHECK (response_state IN
        ('pending','running','stopping','completed','cancelled','failed')),
      native_delivery_id text,
      native_turn_id text,
      dispatch_start_index bigint CHECK (dispatch_start_index >= 0),
      input_event_id text UNIQUE,
      dispatch_started_at timestamptz,
      deadline_at timestamptz,
      last_error_code text,
      output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
      revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY (message_id, conversation_id)
        REFERENCES submitted_messages(id, conversation_id),
      CHECK (dispatch_started_at IS NULL OR (deadline_at IS NOT NULL AND
        dispatch_start_index IS NOT NULL AND deadline_at > dispatch_started_at))
    );
    CREATE UNIQUE INDEX response_attempts_one_outstanding_idx
      ON response_attempts (conversation_id)
      WHERE response_state IN ('pending','running','stopping') AND dispatch_state <> 'rejected';
    CREATE INDEX response_attempts_principal_budget_idx
      ON response_attempts (created_at, response_state);

    CREATE TABLE event_projections (
      native_event_id text PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      native_session_id text NOT NULL,
      stream_index bigint CHECK (stream_index >= 0),
      event_type text NOT NULL,
      turn_id text,
      step_index integer,
      visible_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      emitted_at timestamptz NOT NULL,
      UNIQUE (conversation_id, stream_index)
    );
    CREATE INDEX event_projections_conversation_order_idx
      ON event_projections (conversation_id, stream_index, native_event_id);

    CREATE TABLE watchdog_jobs (
      attempt_id uuid PRIMARY KEY REFERENCES response_attempts(id),
      deadline_at timestamptz NOT NULL,
      state text NOT NULL CHECK (state IN
        ('pending','leased','cancel_requested','settled','needs_attention')),
      lease_owner text,
      lease_expires_at timestamptz,
      next_attempt_at timestamptz NOT NULL,
      failure_count integer NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
      last_error_code text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
    );
    CREATE INDEX watchdog_jobs_due_idx
      ON watchdog_jobs (state, next_attempt_at, deadline_at);
    CREATE FUNCTION turas_watchdog_deadline_matches() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM response_attempts a
        WHERE a.id = NEW.attempt_id AND a.deadline_at = NEW.deadline_at) THEN
        RAISE EXCEPTION 'watchdog deadline does not match attempt' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER watchdog_deadline_matches BEFORE INSERT OR UPDATE ON watchdog_jobs
      FOR EACH ROW EXECUTE FUNCTION turas_watchdog_deadline_matches();

    CREATE TABLE maintenance_workers (
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      worker_id text NOT NULL CHECK (length(worker_id) > 0),
      last_seen_at timestamptz NOT NULL,
      PRIMARY KEY (environment_id, worker_id)
    );
    CREATE INDEX maintenance_workers_fresh_idx
      ON maintenance_workers (environment_id, last_seen_at DESC);

    CREATE TABLE maintenance_nonces (
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      nonce_digest text NOT NULL CHECK (nonce_digest ~ '^[0-9a-f]{64}$'),
      consumed_at timestamptz NOT NULL,
      expires_at timestamptz NOT NULL CHECK (expires_at > consumed_at),
      PRIMARY KEY (environment_id, nonce_digest)
    );
    CREATE INDEX maintenance_nonces_expiry_idx ON maintenance_nonces (expires_at);
  `);
};
