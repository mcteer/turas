exports.up=pgm=>pgm.sql(`
 ALTER TABLE response_attempts DROP CONSTRAINT response_attempts_response_state_check;
 ALTER TABLE response_attempts ADD CONSTRAINT response_attempts_response_state_check
  CHECK(response_state IN('pending','running','waiting_input','stopping','completed','cancelled','failed'));
 CREATE TABLE native_input_resume_windows(
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  native_event_id text NOT NULL UNIQUE REFERENCES event_projections(native_event_id),
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),deadline_at timestamptz NOT NULL,
  PRIMARY KEY(attempt_id,native_event_id),
  CHECK(deadline_at>issued_at AND deadline_at<=issued_at+interval '120 seconds'));
 CREATE TRIGGER native_input_resume_immutable BEFORE UPDATE OR DELETE ON native_input_resume_windows
  FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 GRANT SELECT,INSERT ON native_input_resume_windows TO turas_runtime;
 CREATE TABLE ordinary_continuation_authorities(
  id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES general_context_receipts(attempt_id),
  login_session_id uuid NOT NULL REFERENCES login_sessions(id),membership_id uuid NOT NULL REFERENCES memberships(id),
  owner_principal_id uuid NOT NULL REFERENCES principals(id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),valid_until timestamptz NOT NULL,
  UNIQUE(attempt_id,login_session_id),CHECK(valid_until>created_at));
 CREATE TRIGGER ordinary_continuation_immutable BEFORE UPDATE OR DELETE ON ordinary_continuation_authorities
  FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 CREATE VIEW ordinary_chat_authorities AS SELECT g.attempt_id,g.conversation_id,g.workspace_id,g.environment_id,g.owner_principal_id,
  COALESCE(continuation.login_session_id,g.login_session_id) AS login_session_id,
  COALESCE(continuation.membership_id,g.membership_id) AS membership_id,g.as_of,
  COALESCE(continuation.valid_until,g.valid_until) AS valid_until,g.snapshot_digest
  FROM general_context_receipts g LEFT JOIN LATERAL(
   SELECT authority.login_session_id,authority.membership_id,authority.valid_until FROM ordinary_continuation_authorities authority
    WHERE authority.attempt_id=g.attempt_id AND authority.owner_principal_id=g.owner_principal_id
      AND authority.workspace_id=g.workspace_id AND authority.environment_id=g.environment_id
    ORDER BY authority.created_at DESC,authority.id DESC LIMIT 1) continuation ON true;
 GRANT SELECT,INSERT ON ordinary_continuation_authorities TO turas_runtime;
 GRANT SELECT ON ordinary_chat_authorities TO turas_runtime;
 CREATE OR REPLACE FUNCTION turas_watchdog_deadline_matches() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM response_attempts a WHERE a.id=NEW.attempt_id AND a.deadline_at=NEW.deadline_at)
   AND NOT EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections event ON event.native_event_id=resume.native_event_id
    WHERE resume.attempt_id=NEW.attempt_id AND resume.deadline_at=NEW.deadline_at AND event.event_type='input.resolved') THEN
   RAISE EXCEPTION 'watchdog deadline does not match an admitted response window' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
`);
exports.down=()=>{throw Error('Pending native input requires forward recovery');};
