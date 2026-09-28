exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE profile_audit_events
    ADD COLUMN record_version bigint,
    ADD COLUMN duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0)`);
};

exports.down = () => {
  throw new Error("Profile audit metrics cannot be removed");
};
