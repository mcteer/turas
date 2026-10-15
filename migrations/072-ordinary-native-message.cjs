exports.up=pgm=>pgm.sql(`
 ALTER TABLE submitted_messages ADD COLUMN ordinary_native_parts jsonb CHECK(
  ordinary_native_parts IS NULL OR (jsonb_typeof(ordinary_native_parts)='array'
   AND jsonb_array_length(ordinary_native_parts) BETWEEN 1 AND 11
   AND octet_length(ordinary_native_parts::text)<=3276800));
 ALTER TABLE submitted_messages DROP CONSTRAINT submitted_messages_text_check;
 ALTER TABLE submitted_messages ADD CONSTRAINT submitted_messages_text_check CHECK(
  octet_length(text) BETWEEN 1 AND 16384 OR
  (octet_length(text) BETWEEN 1 AND 3145728 AND
   (strpos(text,'[[turas-attachment-text]]')>0 OR ordinary_native_parts IS NOT NULL)));
 CREATE OR REPLACE FUNCTION turas_submitted_message_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
   OR NEW.request_key IS DISTINCT FROM OLD.request_key
   OR NEW.body_digest IS DISTINCT FROM OLD.body_digest
   OR NEW.text IS DISTINCT FROM OLD.text
   OR NEW.ordinary_native_parts IS DISTINCT FROM OLD.ordinary_native_parts THEN
   RAISE EXCEPTION 'submitted message is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
`);
exports.down=()=>{throw Error('Native file input requires forward recovery');};
