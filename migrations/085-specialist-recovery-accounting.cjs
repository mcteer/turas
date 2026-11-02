exports.up=pgm=>pgm.sql(`
 ALTER TABLE operations_recovery_model_holds
  ADD COLUMN discussion_id uuid, ADD COLUMN assignment_id uuid, ADD COLUMN native_step_key text,
  ADD COLUMN ceiling_input_tokens bigint CHECK(ceiling_input_tokens>=0),
  ADD COLUMN ceiling_output_tokens bigint CHECK(ceiling_output_tokens>=0),
  ADD COLUMN actual_input_tokens bigint CHECK(actual_input_tokens>=0),
  ADD COLUMN actual_output_tokens bigint CHECK(actual_output_tokens>=0),
  ADD COLUMN completed_at timestamptz;
 DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='operations_recovery_model_holds'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%operation_kind%' LOOP
   EXECUTE format('ALTER TABLE operations_recovery_model_holds DROP CONSTRAINT %I',c.conname);
  END LOOP;
 END $$;
 ALTER TABLE operations_recovery_model_holds ADD CONSTRAINT recovery_hold_typed_shape CHECK (
  (operation_kind IN('ordinary_tokens','parity_dollars') AND discussion_id IS NULL AND assignment_id IS NULL AND native_step_key IS NULL
   AND ceiling_input_tokens IS NULL AND ceiling_output_tokens IS NULL AND actual_input_tokens IS NULL AND actual_output_tokens IS NULL AND completed_at IS NULL
   AND ((operation_kind='ordinary_tokens' AND ceiling_tokens IS NOT NULL AND ceiling_micro_usd IS NULL AND actual_micro_usd IS NULL AND ((actual_tokens IS NULL)=(settled_at IS NULL)))
    OR (operation_kind='parity_dollars' AND ceiling_micro_usd IS NOT NULL AND ceiling_tokens IS NULL AND actual_tokens IS NULL AND ((actual_micro_usd IS NULL)=(settled_at IS NULL))))
   AND ((operation_kind='ordinary_tokens' AND baseline_output_tokens IS NOT NULL) OR (operation_kind='parity_dollars' AND baseline_output_tokens IS NULL)))
  OR (operation_kind='specialist' AND discussion_id IS NOT NULL AND assignment_id IS NOT NULL AND native_step_key IS NOT NULL AND length(native_step_key) BETWEEN 1 AND 512
   AND ceiling_input_tokens IS NOT NULL AND ceiling_output_tokens IS NOT NULL AND ceiling_micro_usd IS NOT NULL
   AND ceiling_tokens IS NULL AND actual_tokens IS NULL AND baseline_output_tokens IS NULL
   AND ((settled_at IS NULL AND actual_input_tokens IS NULL AND actual_output_tokens IS NULL AND actual_micro_usd IS NULL)
    OR (settled_at IS NOT NULL AND actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL AND actual_micro_usd IS NOT NULL)))
 );
 ALTER TABLE operations_recovery_model_observations
  ADD COLUMN discussion_id uuid, ADD COLUMN assignment_id uuid, ADD COLUMN native_step_key text,
  ADD COLUMN ceiling_input_tokens bigint CHECK(ceiling_input_tokens>=0),
  ADD COLUMN ceiling_output_tokens bigint CHECK(ceiling_output_tokens>=0),
  ADD COLUMN actual_input_tokens bigint CHECK(actual_input_tokens>=0),
  ADD COLUMN actual_output_tokens bigint CHECK(actual_output_tokens>=0),
  ADD COLUMN completed_at timestamptz;
 DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='operations_recovery_model_observations'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%operation_kind%' LOOP
   EXECUTE format('ALTER TABLE operations_recovery_model_observations DROP CONSTRAINT %I',c.conname);
  END LOOP;
 END $$;
 ALTER TABLE operations_recovery_model_observations ADD CONSTRAINT recovery_observation_typed_shape CHECK (
  (operation_kind IN('ordinary_tokens','parity_dollars') AND discussion_id IS NULL AND assignment_id IS NULL AND native_step_key IS NULL
   AND ceiling_input_tokens IS NULL AND ceiling_output_tokens IS NULL AND actual_input_tokens IS NULL AND actual_output_tokens IS NULL AND completed_at IS NULL
   AND ((operation_kind='ordinary_tokens' AND ceiling_tokens IS NOT NULL AND ceiling_micro_usd IS NULL AND actual_micro_usd IS NULL AND ((actual_tokens IS NULL)=(settled_at IS NULL)))
    OR (operation_kind='parity_dollars' AND ceiling_micro_usd IS NOT NULL AND ceiling_tokens IS NULL AND actual_tokens IS NULL AND ((actual_micro_usd IS NULL)=(settled_at IS NULL))))
   )
  OR (operation_kind='specialist' AND discussion_id IS NOT NULL AND assignment_id IS NOT NULL AND native_step_key IS NOT NULL AND length(native_step_key) BETWEEN 1 AND 512
   AND ceiling_input_tokens IS NOT NULL AND ceiling_output_tokens IS NOT NULL AND ceiling_micro_usd IS NOT NULL
   AND ceiling_tokens IS NULL AND actual_tokens IS NULL
   AND ((settled_at IS NULL AND actual_input_tokens IS NULL AND actual_output_tokens IS NULL AND actual_micro_usd IS NULL)
    OR (settled_at IS NOT NULL AND actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL AND actual_micro_usd IS NOT NULL)))
 );
 CREATE INDEX recovery_specialist_scope_idx ON operations_recovery_model_holds(environment_id,scope_id) WHERE operation_kind='specialist';
 CREATE INDEX recovery_specialist_native_step_idx ON operations_recovery_model_holds(native_step_key) WHERE operation_kind='specialist';
 CREATE TRIGGER recovered_request_replay BEFORE INSERT OR UPDATE ON specialist_discussions FOR EACH ROW EXECUTE FUNCTION turas_recovery_replay_guard();
 CREATE TRIGGER recovered_request_replay BEFORE INSERT OR UPDATE ON specialist_assignments FOR EACH ROW EXECUTE FUNCTION turas_recovery_replay_guard();
 CREATE TRIGGER recovered_request_replay BEFORE INSERT OR UPDATE ON specialist_operations FOR EACH ROW EXECUTE FUNCTION turas_recovery_replay_guard();
 UPDATE turas_environment SET schema_version=85 WHERE schema_version=84;
`);
exports.down=()=>{throw Error('Recovered specialist charges require explicit forward recovery');};
