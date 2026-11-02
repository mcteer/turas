exports.up = pgm => pgm.sql(`
 ALTER TABLE conversations ADD COLUMN native_protocol smallint NOT NULL DEFAULT 25
  CHECK(native_protocol IN(25,27));
 -- The old deployment can keep writing protocol 25 during a compatible rollout.
 -- The new binding transaction explicitly marks only its fresh sessions as 27.
 CREATE FUNCTION turas_native_protocol_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF OLD.eve_session_id IS NOT NULL AND NEW.native_protocol IS DISTINCT FROM OLD.native_protocol THEN
   RAISE EXCEPTION 'native protocol association is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END;
 $$;
 CREATE TRIGGER native_protocol_immutable BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION turas_native_protocol_immutable();
 UPDATE turas_environment SET schema_version=82 WHERE schema_version=81;
`);
exports.down = () => { throw Error('Native protocol custody requires forward recovery'); };
