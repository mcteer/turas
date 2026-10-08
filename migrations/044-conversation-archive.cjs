exports.up = (pgm) => {
  pgm.sql(`ALTER TABLE conversations ADD COLUMN archived_at timestamptz;
    CREATE INDEX conversations_owner_archive_idx ON conversations(environment_id,owner_principal_id,updated_at DESC,id DESC) WHERE archived_at IS NULL;`);
};
exports.down = (pgm) => { pgm.sql('DROP INDEX conversations_owner_archive_idx; ALTER TABLE conversations DROP COLUMN archived_at'); };
