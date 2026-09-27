exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE response_attempts
      ADD COLUMN native_receipt jsonb,
      ADD COLUMN native_response_status integer CHECK
        (native_response_status IS NULL OR native_response_status BETWEEN 200 AND 299),
      ADD COLUMN native_response_headers jsonb,
      ADD COLUMN dispatch_retry_count integer NOT NULL DEFAULT 0 CHECK
        (dispatch_retry_count BETWEEN 0 AND 5),
      ADD CONSTRAINT native_receipt_pair CHECK
        ((native_receipt IS NULL) = (native_response_status IS NULL));
  `);
};
