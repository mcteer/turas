exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE memberships ADD CONSTRAINT memberships_id_workspace_unique UNIQUE (id, workspace_id);

    CREATE TABLE customer_references (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
      synthetic boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (id, workspace_id)
    );
    CREATE INDEX customer_references_workspace_name_idx
      ON customer_references (workspace_id, display_name, id);

    CREATE TABLE customer_grants (
      id uuid PRIMARY KEY,
      membership_id uuid NOT NULL,
      workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,
      state text NOT NULL CHECK (state IN ('active', 'revoked')),
      revision bigint NOT NULL CHECK (revision >= 1),
      granted_by uuid NOT NULL REFERENCES principals(id),
      changed_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (membership_id, customer_id),
      FOREIGN KEY (membership_id, workspace_id) REFERENCES memberships(id, workspace_id),
      FOREIGN KEY (customer_id, workspace_id) REFERENCES customer_references(id, workspace_id)
    );
    CREATE INDEX customer_grants_member_state_idx
      ON customer_grants (membership_id, state, customer_id);

    CREATE FUNCTION turas_partner_grant_only() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM memberships m
        WHERE m.id = NEW.membership_id AND m.workspace_id = NEW.workspace_id AND m.kind = 'partner'
      ) THEN
        RAISE EXCEPTION 'customer grants require a partner membership' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER customer_grants_partner_only BEFORE INSERT OR UPDATE ON customer_grants
      FOR EACH ROW EXECUTE FUNCTION turas_partner_grant_only();

    CREATE TABLE access_audit (
      id uuid PRIMARY KEY,
      actor_principal_id uuid REFERENCES principals(id),
      actor_session_id uuid,
      workspace_id uuid REFERENCES workspaces(id),
      customer_id uuid REFERENCES customer_references(id),
      subject_id uuid,
      action text NOT NULL CHECK (length(action) > 0),
      outcome text NOT NULL CHECK (length(outcome) > 0),
      correlation_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX access_audit_workspace_time_idx ON access_audit (workspace_id, created_at DESC, id);

    CREATE TABLE admin_commands (
      id uuid PRIMARY KEY,
      actor_principal_id uuid NOT NULL REFERENCES principals(id),
      request_key uuid NOT NULL,
      body_digest text NOT NULL CHECK (body_digest ~ '^[0-9a-f]{64}$'),
      action text NOT NULL,
      result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_principal_id, request_key)
    );
  `);
};
