exports.up = pgm => pgm.sql(`
 ALTER TABLE turas_evidence_snapshots ADD COLUMN check_receipt jsonb;
`);
exports.down = () => { throw Error('Source provenance requires forward recovery'); };
