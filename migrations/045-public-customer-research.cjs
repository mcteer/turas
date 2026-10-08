exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public_customer_research_results (
      id uuid PRIMARY KEY,
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),
      customer_id uuid NOT NULL REFERENCES customer_references(id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      batch_digest text NOT NULL CHECK(batch_digest ~ '^[0-9a-f]{64}$'),
      request_key uuid NOT NULL,
      input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),
      dossier jsonb NOT NULL,
      source_revision_ids uuid[] NOT NULL,
      provider_usage jsonb NOT NULL,
      state text NOT NULL CHECK(state IN ('researched','partial')),
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(environment_id,workspace_id,request_key)
    );
    CREATE INDEX public_customer_research_history_idx ON public_customer_research_results(environment_id,workspace_id,customer_id,created_at DESC);
    CREATE TRIGGER public_customer_research_results_immutable BEFORE UPDATE OR DELETE ON public_customer_research_results
      FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
  `);
};
exports.down = () => { throw new Error('Public research receipts require forward recovery'); };
