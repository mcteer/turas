exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE artifact_upload_intents
      ADD COLUMN replacement_of_version_id uuid,
      ADD COLUMN replacement_expected_generation bigint,
      ADD COLUMN initiating_principal_id uuid REFERENCES principals(id),
      ADD CONSTRAINT artifact_replacement_intent_shape CHECK (
        num_nonnulls(replacement_of_version_id,replacement_expected_generation,
          initiating_principal_id) IN (0,3)
        AND (replacement_expected_generation IS NULL OR replacement_expected_generation >= 1)),
      ADD CONSTRAINT artifact_replacement_source_fk
        FOREIGN KEY (replacement_of_version_id,environment_id,workspace_id,customer_id,
          owner_principal_id)
        REFERENCES artifact_versions(id,environment_id,workspace_id,customer_id,
          owner_principal_id);
    CREATE INDEX artifact_replacement_intent_idx ON artifact_upload_intents(replacement_of_version_id)
      WHERE replacement_of_version_id IS NOT NULL;

    CREATE TABLE artifact_native_retirement_receipts (
      id uuid PRIMARY KEY,
      version_id uuid NOT NULL REFERENCES artifact_versions(id),
      conversation_id uuid NOT NULL REFERENCES conversations(id),
      environment_id text NOT NULL,
      workspace_id uuid NOT NULL,
      lifecycle_generation bigint NOT NULL CHECK (lifecycle_generation >= 1),
      state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','retry','done','unavailable')),
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      safe_error_code text,
      next_attempt_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (version_id,conversation_id,lifecycle_generation)
    );
  `);
};

exports.down = () => {
  throw new Error('Artifact replacement migration requires forward repair');
};
