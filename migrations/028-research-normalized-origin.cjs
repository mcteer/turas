exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE research_observations ADD COLUMN normalized_digest text
      CHECK (normalized_digest IS NULL OR normalized_digest ~ '^[0-9a-f]{64}$');
    UPDATE research_observations observation
    SET normalized_digest=encode(sha256(convert_to(payload.normalized_text,'UTF8')),'hex')
    FROM research_observation_payloads payload
    WHERE payload.observation_id=observation.id;
    CREATE INDEX research_observations_submission_identity_idx
      ON research_observations(normalized_digest)
      WHERE origin='user_submission' AND normalized_digest IS NOT NULL;
  `);
};

exports.down = () => { throw new Error('Research origin identity requires forward repair'); };
