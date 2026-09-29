exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE knowledge_submit_receipts (
      id uuid PRIMARY KEY,
      contribution_id uuid NOT NULL REFERENCES knowledge_contributions(id),
      revision_id uuid NOT NULL,
      actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
      request_digest text NOT NULL CHECK (request_digest ~ '^[0-9a-f]{64}$'),
      submitted_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (actor_membership_id,idempotency_key),
      FOREIGN KEY (revision_id,contribution_id)
        REFERENCES knowledge_revisions(id,contribution_id)
    );
    CREATE TRIGGER knowledge_submit_receipts_immutable
      BEFORE UPDATE OR DELETE ON knowledge_submit_receipts
      FOR EACH ROW EXECUTE FUNCTION turas_knowledge_immutable();

    ALTER TABLE session_evidence_dependencies
      DROP CONSTRAINT session_evidence_dependencies_receipt_id_fkey;
    CREATE OR REPLACE FUNCTION turas_retrieval_receipt_immutable() RETURNS trigger
      LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_OP='DELETE' AND current_setting('turas.receipt_cleanup',true)='on'
        AND OLD.valid_until < now()-interval '30 days' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'retrieval receipt is append-only' USING ERRCODE='23514';
    END;
    $$;
    CREATE FUNCTION turas_expire_retrieval_receipts() RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE removed integer;
    BEGIN
      PERFORM set_config('turas.receipt_cleanup','on',true);
      DELETE FROM retrieval_receipt_sources WHERE valid_until < now()-interval '30 days';
      DELETE FROM retrieval_receipts WHERE valid_until < now()-interval '30 days';
      GET DIAGNOSTICS removed = ROW_COUNT;
      PERFORM set_config('turas.receipt_cleanup','off',true);
      RETURN removed;
    END;
    $$;
    REVOKE ALL ON FUNCTION turas_expire_retrieval_receipts() FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION turas_expire_retrieval_receipts() TO turas_runtime;
  `);
};

exports.down = () => { throw new Error('Knowledge receipts and retention require forward repair'); };
