exports.up=pgm=>pgm.sql(`
 ALTER TABLE conversations ADD COLUMN live_customer_context boolean NOT NULL DEFAULT false;
 UPDATE conversations SET live_customer_context=true WHERE customer_id IS NOT NULL AND context_snapshot_schema='customer-context-v1';
`);
exports.down=()=>{throw Error('Live ordinary chat requires forward recovery');};
