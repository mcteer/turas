exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_context_refreshes (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES general_context_receipts(attempt_id),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  packet_digest text NOT NULL CHECK(packet_digest ~ '^[0-9a-f]{64}$'),
  customer_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 );
 CREATE TABLE ordinary_evidence_refreshes (
  dependency_id uuid PRIMARY KEY REFERENCES session_evidence_dependencies(id),
  refresh_id uuid NOT NULL REFERENCES ordinary_context_refreshes(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 );
 CREATE TRIGGER ordinary_context_refreshes_immutable BEFORE UPDATE OR DELETE ON ordinary_context_refreshes
  FOR EACH ROW EXECUTE FUNCTION turas_retrieval_receipt_immutable();
 CREATE TRIGGER ordinary_evidence_refreshes_immutable BEFORE UPDATE OR DELETE ON ordinary_evidence_refreshes
  FOR EACH ROW EXECUTE FUNCTION turas_retrieval_receipt_immutable();
`);
exports.down=()=>{throw Error('Ordinary context refresh requires forward recovery');};
