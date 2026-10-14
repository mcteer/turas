exports.up = pgm => pgm.sql(`
 CREATE TABLE customer_reference_aliases(
  customer_id uuid NOT NULL REFERENCES customer_references(id),
  alias text NOT NULL CHECK(length(trim(alias)) BETWEEN 1 AND 200),
  kind text NOT NULL DEFAULT 'name' CHECK(kind IN('name','documented_workload')),
  PRIMARY KEY(customer_id,alias,kind));
 CREATE TABLE general_customer_read_scopes(
  attempt_id uuid NOT NULL REFERENCES general_context_receipts(attempt_id),
  customer_id uuid NOT NULL REFERENCES customer_references(id),
  audience text NOT NULL CHECK(audience IN('internal','delivery')),
  generation bigint NOT NULL CHECK(generation>=0),
  citation_ids text[] NOT NULL CHECK(cardinality(citation_ids)<=100),
  checked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(attempt_id,customer_id));
 GRANT SELECT ON customer_reference_aliases TO turas_runtime;
 GRANT SELECT,INSERT,UPDATE ON general_customer_read_scopes TO turas_runtime;
`);
exports.down = () => { throw Error('Named customer chat requires forward recovery'); };
