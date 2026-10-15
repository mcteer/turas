exports.up=pgm=>pgm.sql(`
 CREATE TABLE research_background_turns(
  native_session_id text NOT NULL,turn_id text NOT NULL,
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  native_event_id text NOT NULL UNIQUE,
  admitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(native_session_id,turn_id));
 GRANT SELECT,INSERT ON research_background_turns TO turas_runtime;
`);
exports.down=()=>{throw Error('Background-turn provenance requires forward recovery');};
