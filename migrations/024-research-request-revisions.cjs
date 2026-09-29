exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE research_request_revisions (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES research_requests(id),
      revision_number integer NOT NULL CHECK (revision_number >= 1),
      content_digest text NOT NULL CHECK (content_digest ~ '^[0-9a-f]{64}$'),
      public_fields jsonb NOT NULL CHECK
        (jsonb_typeof(public_fields)='object' AND octet_length(public_fields::text) <= 4096),
      rendered_queries jsonb NOT NULL CHECK (turas_research_queries_valid(rendered_queries)),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (request_id,revision_number),
      UNIQUE (actor_membership_id,idempotency_key)
    );
    CREATE FUNCTION turas_research_revision_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'research request revision is immutable' USING ERRCODE='23514';
    END;
    $$;
    CREATE TRIGGER research_request_revisions_immutable
      BEFORE UPDATE OR DELETE ON research_request_revisions
      FOR EACH ROW EXECUTE FUNCTION turas_research_revision_immutable();

    ALTER TABLE research_runs ADD COLUMN start_idempotency_key text CHECK
      (start_idempotency_key IS NULL OR length(start_idempotency_key) BETWEEN 1 AND 128);
    ALTER TABLE research_runs ADD COLUMN start_request_digest text CHECK
      (start_request_digest IS NULL OR start_request_digest ~ '^[0-9a-f]{64}$');
    CREATE UNIQUE INDEX research_runs_start_key_idx ON research_runs
      (actor_membership_id,start_idempotency_key) WHERE start_idempotency_key IS NOT NULL;

    CREATE TABLE research_cancel_receipts (
      id uuid PRIMARY KEY,
      run_id uuid NOT NULL REFERENCES research_runs(id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_membership_id,idempotency_key)
    );
    CREATE TRIGGER research_cancel_receipts_immutable
      BEFORE UPDATE OR DELETE ON research_cancel_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_research_revision_immutable();
  `);
};
exports.down = () => { throw new Error('Research admission requires forward repair'); };
