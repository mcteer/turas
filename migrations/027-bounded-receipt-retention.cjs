exports.up = (pgm) => {
  pgm.sql(`
    CREATE OR REPLACE FUNCTION turas_expire_retrieval_receipts() RETURNS integer
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
    DECLARE removed integer;
    DECLARE batch_ids uuid[];
    BEGIN
      PERFORM set_config('turas.receipt_cleanup','on',true);
      SELECT array_agg(id) INTO batch_ids FROM (
        SELECT id FROM retrieval_receipts
        WHERE valid_until < now()-interval '30 days'
        ORDER BY valid_until,id LIMIT 100 FOR UPDATE SKIP LOCKED
      ) batch;
      DELETE FROM retrieval_receipt_sources WHERE receipt_id=ANY(batch_ids);
      DELETE FROM retrieval_receipts WHERE id=ANY(batch_ids);
      GET DIAGNOSTICS removed = ROW_COUNT;
      PERFORM set_config('turas.receipt_cleanup','off',true);
      RETURN removed;
    END;
    $$;
  `);
};

exports.down = () => { throw new Error('Receipt retention requires forward repair'); };
