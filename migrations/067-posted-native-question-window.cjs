exports.up=pgm=>pgm.sql(`
 CREATE OR REPLACE FUNCTION turas_watchdog_deadline_matches() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM response_attempts a WHERE a.id=NEW.attempt_id AND a.deadline_at=NEW.deadline_at)
   AND NOT EXISTS(SELECT 1 FROM native_input_resume_windows resume JOIN event_projections event ON event.native_event_id=resume.native_event_id
    WHERE resume.attempt_id=NEW.attempt_id AND resume.deadline_at=NEW.deadline_at
      AND event.event_type IN('input.requested','input.resolved')) THEN
   RAISE EXCEPTION 'watchdog deadline does not match an admitted response window' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END $$;
`);
exports.down=()=>{throw Error('Posted native input requires forward recovery');};
