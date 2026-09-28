exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE profile_revisions
      ADD COLUMN submission_channel text NOT NULL DEFAULT 'profile_form'
      CHECK (submission_channel IN ('profile_form','chat_share','agent_proposal','synthetic_bootstrap'));
  `);
};
