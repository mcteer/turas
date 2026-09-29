exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE research_refresh_observations
      ADD COLUMN actor_membership_id uuid REFERENCES memberships(id),
      ADD COLUMN idempotency_key text CHECK
        (idempotency_key IS NULL OR length(idempotency_key) BETWEEN 1 AND 128),
      ADD COLUMN request_digest text CHECK
        (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$');
    CREATE UNIQUE INDEX research_refresh_actor_key_idx ON research_refresh_observations
      (actor_membership_id,idempotency_key);

    CREATE TABLE research_review_due (
      source_revision_id uuid PRIMARY KEY REFERENCES evidence_source_revisions(id),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      due_at timestamptz NOT NULL,
      state text NOT NULL CHECK (state IN ('current','due')),
      marked_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX research_review_due_queue_idx ON research_review_due
      (environment_id,state,due_at);

    CREATE TABLE evidence_conflict_target_receipts (
      id uuid PRIMARY KEY,
      conflict_id uuid NOT NULL REFERENCES evidence_conflict_targets(id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      action text NOT NULL CHECK (action IN ('flag','confirm','resolve')),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      result_version bigint NOT NULL CHECK (result_version >= 1),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_membership_id,idempotency_key)
    );
    CREATE TRIGGER evidence_conflict_target_receipts_immutable
      BEFORE UPDATE OR DELETE ON evidence_conflict_target_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();
  `);
};

exports.down = () => { throw new Error('Review and conflict audit requires forward repair'); };
