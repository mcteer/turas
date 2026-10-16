exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_native_retirements(
  id uuid PRIMARY KEY,
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  owner_principal_id uuid NOT NULL REFERENCES principals(id),
  conversation_id uuid NOT NULL UNIQUE REFERENCES conversations(id),
  native_session_id text NOT NULL,
  state text NOT NULL DEFAULT 'requested' CHECK(state IN('requested','confirmed')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  confirmed_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  safe_error_code text,
  CHECK((state='confirmed')=(confirmed_at IS NOT NULL))
 );
 CREATE INDEX ordinary_native_retirements_pending ON ordinary_native_retirements(next_attempt_at,id) WHERE state='requested';
 CREATE FUNCTION turas_ordinary_retirement_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='UPDATE' AND ((NEW.id,NEW.environment_id,NEW.workspace_id,NEW.owner_principal_id,NEW.conversation_id,NEW.native_session_id,NEW.requested_at)
   IS DISTINCT FROM (OLD.id,OLD.environment_id,OLD.workspace_id,OLD.owner_principal_id,OLD.conversation_id,OLD.native_session_id,OLD.requested_at)
   OR OLD.state='confirmed' AND NEW.state<>'confirmed') THEN
   RAISE EXCEPTION 'ordinary retirement identity immutable' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=NEW.conversation_id AND c.environment_id=NEW.environment_id
   AND c.workspace_id=NEW.workspace_id AND c.owner_principal_id=NEW.owner_principal_id AND c.eve_session_id=NEW.native_session_id AND c.binding_state='bound') THEN
   RAISE EXCEPTION 'ordinary retirement requires exact native owner binding' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER ordinary_native_retirement_identity BEFORE INSERT OR UPDATE ON ordinary_native_retirements FOR EACH ROW EXECUTE FUNCTION turas_ordinary_retirement_identity();
 UPDATE turas_environment SET schema_version=76 WHERE schema_version=75;
`);
exports.down=()=>{throw Error('Native retirement recovery requires forward recovery');};
