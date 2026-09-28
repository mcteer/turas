exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE profile_retraction_requests ADD COLUMN version bigint NOT NULL DEFAULT 1
      CHECK (version >= 1);
    ALTER TABLE profile_retraction_requests ADD COLUMN resolution_rationale text;
    ALTER TABLE profile_retraction_requests ADD COLUMN partner_safe_reason text;
    CREATE UNIQUE INDEX profile_one_open_retraction_request
      ON profile_retraction_requests(accepted_revision_id,requesting_membership_id)
      WHERE state='open';
  `);
};
