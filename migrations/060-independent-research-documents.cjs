exports.up = pgm => pgm.sql(`
 CREATE TABLE independent_research_documents(
  source_revision_id uuid PRIMARY KEY REFERENCES evidence_source_revisions(id),
  document_text text NOT NULL CHECK(length(document_text) BETWEEN 1 AND 1000000),
  document_digest text NOT NULL CHECK(document_digest~'^[a-f0-9]{64}$'));
 CREATE FUNCTION turas_research_document_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Research document provenance is immutable'; END $$;
 CREATE TRIGGER research_document_immutable BEFORE UPDATE OR DELETE ON independent_research_documents
  FOR EACH ROW EXECUTE FUNCTION turas_research_document_immutable();
 GRANT SELECT,INSERT ON independent_research_documents TO turas_runtime;
`);
exports.down = () => { throw Error('Research documents require forward recovery'); };
