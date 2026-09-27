exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE conversations
      ADD COLUMN binding_attempts integer NOT NULL DEFAULT 0 CHECK (binding_attempts BETWEEN 0 AND 5),
      ADD COLUMN binding_started_at timestamptz,
      ADD COLUMN binding_claim_token uuid,
      ADD COLUMN binding_claim_expires_at timestamptz,
      ADD CONSTRAINT binding_claim_pair CHECK
        ((binding_claim_token IS NULL) = (binding_claim_expires_at IS NULL));
    ALTER TABLE response_attempts
      ADD COLUMN input_digest text NOT NULL CHECK (input_digest ~ '^[0-9a-f]{64}$');

    CREATE FUNCTION turas_submitted_message_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
         OR NEW.request_key IS DISTINCT FROM OLD.request_key
         OR NEW.body_digest IS DISTINCT FROM OLD.body_digest
         OR NEW.text IS DISTINCT FROM OLD.text THEN
        RAISE EXCEPTION 'submitted message is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER submitted_message_immutable BEFORE UPDATE ON submitted_messages
      FOR EACH ROW EXECUTE FUNCTION turas_submitted_message_immutable();

    CREATE FUNCTION turas_response_attempt_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
         OR NEW.message_id IS DISTINCT FROM OLD.message_id
         OR NEW.input_digest IS DISTINCT FROM OLD.input_digest
         OR (OLD.dispatch_start_index IS NOT NULL AND
             NEW.dispatch_start_index IS DISTINCT FROM OLD.dispatch_start_index)
         OR (OLD.dispatch_started_at IS NOT NULL AND
             NEW.dispatch_started_at IS DISTINCT FROM OLD.dispatch_started_at)
         OR (OLD.deadline_at IS NOT NULL AND
             NEW.deadline_at IS DISTINCT FROM OLD.deadline_at)
         OR (OLD.input_event_id IS NOT NULL AND
             NEW.input_event_id IS DISTINCT FROM OLD.input_event_id)
         OR (OLD.native_turn_id IS NOT NULL AND
             NEW.native_turn_id IS DISTINCT FROM OLD.native_turn_id)
      THEN
        RAISE EXCEPTION 'response attempt association is immutable' USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER response_attempt_immutable BEFORE UPDATE ON response_attempts
      FOR EACH ROW EXECUTE FUNCTION turas_response_attempt_immutable();
  `);
};
