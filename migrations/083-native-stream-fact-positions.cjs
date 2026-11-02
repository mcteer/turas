exports.up = pgm => pgm.sql(`
 ALTER TABLE event_projections ADD COLUMN stream_fact_index integer NOT NULL DEFAULT 0 CHECK(stream_fact_index>=0);
 ALTER TABLE event_projections DROP CONSTRAINT event_projections_conversation_id_stream_index_key;
 ALTER TABLE event_projections ADD CONSTRAINT event_projections_stream_position_key
  UNIQUE(conversation_id,stream_index,stream_fact_index);
 UPDATE turas_environment SET schema_version=83 WHERE schema_version=82;
`);
exports.down = () => { throw Error('Committed multi-fact stream positions require forward recovery'); };
