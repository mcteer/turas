exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations ALTER COLUMN customer_id DROP NOT NULL;
    ALTER TABLE conversations ADD CONSTRAINT general_conversation_scope CHECK (
      customer_id IS NOT NULL OR (
        context_snapshot_schema IS NOT DISTINCT FROM 'general-context-v1' AND
        context_audience IS NULL AND context_generation IS NULL
      )
    );
    CREATE TABLE general_context_receipts (
      attempt_id uuid PRIMARY KEY REFERENCES response_attempts(id),
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      owner_principal_id uuid NOT NULL REFERENCES principals(id),
      login_session_id uuid NOT NULL REFERENCES login_sessions(id),
      membership_id uuid NOT NULL REFERENCES memberships(id),
      as_of timestamptz NOT NULL,
      valid_until timestamptz NOT NULL CHECK(valid_until > as_of),
      snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^[0-9a-f]{64}$')
    );
    CREATE TABLE general_context_injections (
      attempt_id uuid NOT NULL REFERENCES general_context_receipts(attempt_id),
      turn_id text NOT NULL,
      snapshot_digest text NOT NULL CHECK(snapshot_digest ~ '^[0-9a-f]{64}$'),
      PRIMARY KEY(attempt_id,turn_id)
    );
    CREATE TRIGGER general_context_receipts_immutable BEFORE UPDATE OR DELETE
      ON general_context_receipts FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER general_context_injections_immutable BEFORE UPDATE OR DELETE
      ON general_context_injections FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
  `);
};
exports.down = () => { throw new Error('General conversation migration requires forward recovery'); };
