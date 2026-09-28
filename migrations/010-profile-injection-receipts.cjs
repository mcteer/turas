exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE context_injection_receipts (
      attempt_id uuid NOT NULL REFERENCES response_attempts(id),
      turn_id text NOT NULL CHECK (length(turn_id) BETWEEN 1 AND 200),
      snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
      injected_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (attempt_id,turn_id)
    );
    CREATE TRIGGER immutable_context_injection_receipt
      BEFORE UPDATE OR DELETE ON context_injection_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_context_receipt_immutable();
  `);
};
