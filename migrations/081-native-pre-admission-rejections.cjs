exports.up = pgm => pgm.sql(`
 ALTER TABLE response_attempts
  DROP CONSTRAINT response_attempts_native_response_status_check,
  ADD CONSTRAINT response_attempts_native_response_status_check CHECK (
   native_response_status IS NULL OR native_response_status BETWEEN 200 AND 299 OR
   (native_response_status=409 AND dispatch_state='rejected' AND response_state='failed'
    AND jsonb_typeof(native_receipt)='object'
    AND native_receipt->'ok'='false'::jsonb
    AND native_receipt->>'code'='session_not_ready'
    AND NOT (native_receipt ?| ARRAY['sessionId','deliveryId'])
    AND native_response_headers='{}'::jsonb
    AND native_delivery_id IS NULL AND native_turn_id IS NULL AND input_event_id IS NULL) IS TRUE
  );
 UPDATE turas_environment SET schema_version=81 WHERE schema_version=80;
`);
exports.down = () => { throw Error('Native rejection receipts require forward recovery'); };
