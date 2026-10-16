exports.up = pgm => pgm.sql(`
 CREATE TABLE ordinary_native_uploads (
  id uuid PRIMARY KEY,
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  owner_principal_id uuid NOT NULL REFERENCES principals(id),
  request_key uuid NOT NULL,
  filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 240),
  media_type text NOT NULL CHECK(length(media_type) BETWEEN 3 AND 160),
  size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK(state IN('uploading','ready','bound','cancelled','expired','purged')),
  bound_message_id uuid REFERENCES submitted_messages(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '30 minutes',
  UNIQUE(conversation_id,request_key),
  CHECK((state='bound') IS NOT DISTINCT FROM (bound_message_id IS NOT NULL) OR state='purged')
 );
 CREATE TABLE ordinary_native_upload_chunks (
  upload_id uuid NOT NULL REFERENCES ordinary_native_uploads(id),
  chunk_index integer NOT NULL CHECK(chunk_index BETWEEN 0 AND 19),
  bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 524288),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY(upload_id,chunk_index)
 );
 CREATE INDEX ordinary_native_upload_expiry ON ordinary_native_uploads(expires_at,id)
  WHERE state IN('uploading','ready','bound');
 CREATE FUNCTION turas_native_upload_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF TG_OP='INSERT' THEN
   IF NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id=NEW.conversation_id
     AND c.environment_id=NEW.environment_id AND c.workspace_id=NEW.workspace_id
     AND c.owner_principal_id=NEW.owner_principal_id) THEN
    RAISE EXCEPTION 'native upload requires owned conversation' USING ERRCODE='23514';
   END IF;
  ELSE
   IF (NEW.id,NEW.environment_id,NEW.workspace_id,NEW.conversation_id,NEW.owner_principal_id,
      NEW.request_key,NEW.filename,NEW.media_type,NEW.size_bytes,NEW.sha256,NEW.created_at)
      IS DISTINCT FROM (OLD.id,OLD.environment_id,OLD.workspace_id,OLD.conversation_id,OLD.owner_principal_id,
      OLD.request_key,OLD.filename,OLD.media_type,OLD.size_bytes,OLD.sha256,OLD.created_at)
    OR (OLD.bound_message_id IS NOT NULL AND NEW.bound_message_id IS DISTINCT FROM OLD.bound_message_id) THEN
    RAISE EXCEPTION 'native upload identity is immutable' USING ERRCODE='23514';
   END IF;
   IF OLD.state IN('cancelled','expired','purged') AND NEW.state<>OLD.state THEN
    RAISE EXCEPTION 'native upload is terminal' USING ERRCODE='23514';
   END IF;
  END IF;
  IF NEW.bound_message_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM submitted_messages m
    WHERE m.id=NEW.bound_message_id AND m.conversation_id=NEW.conversation_id) THEN
   RAISE EXCEPTION 'native upload message scope differs' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER ordinary_native_upload_identity BEFORE INSERT OR UPDATE ON ordinary_native_uploads
  FOR EACH ROW EXECUTE FUNCTION turas_native_upload_identity();
 UPDATE turas_environment SET schema_version=74 WHERE schema_version=73;
`);
exports.down = () => { throw Error('Native upload transport requires forward recovery'); };
