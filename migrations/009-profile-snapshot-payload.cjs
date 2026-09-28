exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE context_snapshot_receipts ADD COLUMN snapshot jsonb NOT NULL;
    ALTER TABLE context_snapshot_receipts ADD CONSTRAINT context_snapshot_payload_bound
      CHECK (octet_length(snapshot::text) <= 32768);
  `);
};
