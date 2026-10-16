exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_question_posts(
  request_event_id text PRIMARY KEY REFERENCES native_input_resume_windows(native_event_id),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  login_session_id uuid NOT NULL REFERENCES login_sessions(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
 );
 CREATE TRIGGER ordinary_question_post_immutable BEFORE UPDATE OR DELETE ON ordinary_question_posts FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 CREATE TABLE ordinary_question_continuations(
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  request_event_id text NOT NULL UNIQUE REFERENCES native_input_resume_windows(native_event_id),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  native_session_id text NOT NULL,
  native_turn_id text NOT NULL CHECK(length(native_turn_id)>0),
  native_sequence integer NOT NULL CHECK(native_sequence>=1),
  login_session_id uuid NOT NULL REFERENCES login_sessions(id),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  deadline_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(attempt_id,native_turn_id)
 );
 CREATE FUNCTION turas_question_continuation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM response_attempts a JOIN conversations c ON c.id=a.conversation_id
   JOIN native_input_resume_windows posted ON posted.attempt_id=a.id AND posted.native_event_id=NEW.request_event_id
   JOIN event_projections request ON request.native_event_id=posted.native_event_id
   JOIN ordinary_question_posts post ON post.request_event_id=NEW.request_event_id AND post.attempt_id=a.id AND post.login_session_id=NEW.login_session_id AND post.membership_id=NEW.membership_id
   JOIN ordinary_continuation_authorities authority ON authority.attempt_id=a.id AND authority.login_session_id=NEW.login_session_id AND authority.membership_id=NEW.membership_id
   WHERE a.id=NEW.attempt_id AND c.id=NEW.conversation_id AND c.eve_session_id=NEW.native_session_id
    AND request.conversation_id=c.id AND request.native_session_id=c.eve_session_id AND request.event_type='input.requested'
    AND posted.deadline_at=NEW.deadline_at AND posted.deadline_at>clock_timestamp()
    AND authority.owner_principal_id=c.owner_principal_id AND authority.workspace_id=c.workspace_id AND authority.environment_id=c.environment_id
    AND jsonb_array_length(COALESCE(request.visible_payload->'requests','[]'::jsonb))>0
    AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(request.visible_payload->'requests') item WHERE item->>'kind'<>'question')) THEN
   RAISE EXCEPTION 'question continuation identity mismatch' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
 CREATE TRIGGER ordinary_question_continuation_identity BEFORE INSERT ON ordinary_question_continuations FOR EACH ROW EXECUTE FUNCTION turas_question_continuation_identity();
 CREATE TRIGGER ordinary_question_continuation_immutable BEFORE UPDATE OR DELETE ON ordinary_question_continuations FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 GRANT SELECT,INSERT ON ordinary_question_posts,ordinary_question_continuations TO turas_runtime;
 UPDATE turas_environment SET schema_version=77 WHERE schema_version=76;
`);
exports.down=()=>{throw Error('Question continuation receipts require forward recovery');};
