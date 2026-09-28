exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE artifact_context_injection_receipts (
      attempt_id uuid NOT NULL REFERENCES artifact_context_receipts(attempt_id),
      turn_id text NOT NULL CHECK (length(turn_id) BETWEEN 1 AND 200),
      injection_digest text NOT NULL CHECK (injection_digest ~ '^[0-9a-f]{64}$'),
      injected_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (attempt_id,turn_id)
    );
  `);
};

exports.down = () => {
  throw new Error('Artifact context injection migration requires forward repair');
};
