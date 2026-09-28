exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations ADD COLUMN context_audience text
      CHECK (context_audience IN ('internal','delivery'));
    ALTER TABLE conversations ADD COLUMN context_generation bigint CHECK (context_generation >= 0);
    ALTER TABLE conversations ADD COLUMN context_valid_until timestamptz;
    ALTER TABLE conversations ADD COLUMN context_snapshot_schema text;
    ALTER TABLE conversations ADD COLUMN context_login_session_id uuid REFERENCES login_sessions(id);
    ALTER TABLE conversations ADD COLUMN context_membership_id uuid REFERENCES memberships(id);
    ALTER TABLE response_attempts ADD COLUMN context_generation bigint CHECK (context_generation >= 0);
    ALTER TABLE response_attempts ADD COLUMN context_valid_until timestamptz;
    ALTER TABLE response_attempts ADD COLUMN context_login_session_id uuid REFERENCES login_sessions(id);
    ALTER TABLE response_attempts ADD COLUMN context_membership_id uuid REFERENCES memberships(id);
    CREATE TABLE context_snapshot_receipts (
      id uuid PRIMARY KEY,
      attempt_id uuid NOT NULL UNIQUE REFERENCES response_attempts(id),
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL REFERENCES customer_references(id),
      owner_principal_id uuid NOT NULL REFERENCES principals(id),
      login_session_id uuid NOT NULL REFERENCES login_sessions(id),
      membership_id uuid NOT NULL REFERENCES memberships(id),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      audience text NOT NULL CHECK (audience IN ('internal','delivery')),
      generation bigint NOT NULL CHECK (generation >= 0),
      as_of timestamptz NOT NULL,
      valid_until timestamptz NOT NULL,
      schema_version text NOT NULL,
      snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
      citation_ids jsonb NOT NULL,
      complete boolean NOT NULL,
      truncated boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (valid_until > as_of)
    );
    CREATE FUNCTION turas_context_receipt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'context receipt is append-only' USING ERRCODE='23514';
    END; $$;
    CREATE TRIGGER immutable_context_receipt BEFORE UPDATE OR DELETE ON context_snapshot_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_context_receipt_immutable();
  `);
};
