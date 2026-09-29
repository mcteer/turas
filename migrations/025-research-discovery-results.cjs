exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE research_discovery_results (
      id uuid PRIMARY KEY,
      operation_id uuid NOT NULL REFERENCES research_operations(id),
      run_id uuid NOT NULL REFERENCES research_runs(id),
      ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 5),
      public_url text NOT NULL CHECK
        (length(public_url) BETWEEN 9 AND 2048 AND public_url ~ '^https://'),
      title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
      publication_at timestamptz,
      provider_receipt_id text CHECK
        (provider_receipt_id IS NULL OR length(provider_receipt_id) <= 200),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (operation_id,ordinal),
      UNIQUE (operation_id,public_url)
    );
    CREATE INDEX research_discovery_results_run_idx ON
      research_discovery_results(run_id,public_url);
    CREATE TRIGGER research_discovery_results_immutable
      BEFORE UPDATE OR DELETE ON research_discovery_results
      FOR EACH ROW EXECUTE FUNCTION turas_research_revision_immutable();
  `);
};
exports.down = () => { throw new Error('Research discovery receipts require forward repair'); };
