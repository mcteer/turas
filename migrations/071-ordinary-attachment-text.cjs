exports.up = pgm => pgm.sql(`
 ALTER TABLE submitted_messages DROP CONSTRAINT submitted_messages_text_check;
 ALTER TABLE submitted_messages ADD CONSTRAINT submitted_messages_text_check CHECK(
  octet_length(text) BETWEEN 1 AND 16384 OR
  (octet_length(text) BETWEEN 1 AND 3145728 AND strpos(text,'[[turas-attachment-text]]')>0));
`);
exports.down = () => { throw Error('Submitted document text requires forward recovery'); };
