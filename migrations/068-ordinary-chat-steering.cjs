exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_steering_deliveries(
  id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  message_id uuid NOT NULL UNIQUE REFERENCES submitted_messages(id),
  login_session_id uuid NOT NULL REFERENCES login_sessions(id),
  deadline_at timestamptz NOT NULL,
  dispatch_state text NOT NULL CHECK(dispatch_state IN('dispatching','admitted','uncertain','rejected')),
  native_delivery_id text,native_event_id text UNIQUE REFERENCES event_projections(native_event_id),
  native_turn_id text,native_receipt jsonb,native_status integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX ordinary_steering_pending_idx ON ordinary_steering_deliveries(attempt_id)
  WHERE dispatch_state IN('dispatching','admitted','uncertain') AND native_event_id IS NULL;
 CREATE FUNCTION turas_steering_association_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id
    OR NEW.message_id IS DISTINCT FROM OLD.message_id OR NEW.login_session_id IS DISTINCT FROM OLD.login_session_id
    OR NEW.deadline_at IS DISTINCT FROM OLD.deadline_at OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (OLD.native_event_id IS NOT NULL AND NEW.native_event_id IS DISTINCT FROM OLD.native_event_id)
    OR (OLD.native_turn_id IS NOT NULL AND NEW.native_turn_id IS DISTINCT FROM OLD.native_turn_id)
    OR (OLD.native_delivery_id IS NOT NULL AND NEW.native_delivery_id IS DISTINCT FROM OLD.native_delivery_id)
    OR (OLD.native_receipt IS NOT NULL AND NEW.native_receipt IS DISTINCT FROM OLD.native_receipt) THEN
   RAISE EXCEPTION 'steering association is immutable' USING ERRCODE='23514';
  END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER ordinary_steering_immutable BEFORE UPDATE ON ordinary_steering_deliveries
  FOR EACH ROW EXECUTE FUNCTION turas_steering_association_immutable();
 GRANT SELECT,INSERT,UPDATE ON ordinary_steering_deliveries TO turas_runtime;
 CREATE TABLE ordinary_conversation_allowances(
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id),
  baseline_output_tokens integer NOT NULL CHECK(baseline_output_tokens>=0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TRIGGER ordinary_allowance_immutable BEFORE UPDATE OR DELETE ON ordinary_conversation_allowances
  FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 CREATE TABLE ordinary_model_operations(
  id uuid PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES ordinary_conversation_allowances(conversation_id),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),ceiling_tokens integer NOT NULL CHECK(ceiling_tokens BETWEEN 1 AND 20000),
  actual_tokens integer CHECK(actual_tokens>=0),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),settled_at timestamptz,
  CHECK((actual_tokens IS NULL)=(settled_at IS NULL)));
 CREATE FUNCTION turas_ordinary_model_operation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.attempt_id IS DISTINCT FROM OLD.attempt_id OR NEW.ceiling_tokens IS DISTINCT FROM OLD.ceiling_tokens
    OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (OLD.actual_tokens IS NOT NULL AND NEW.actual_tokens IS DISTINCT FROM OLD.actual_tokens)
    OR (OLD.settled_at IS NOT NULL AND NEW.settled_at IS DISTINCT FROM OLD.settled_at) THEN
   RAISE EXCEPTION 'ordinary provider reservation is immutable' USING ERRCODE='23514';
  END IF;RETURN NEW;
 END $$;
 CREATE TRIGGER ordinary_model_operation_immutable BEFORE UPDATE ON ordinary_model_operations
  FOR EACH ROW EXECUTE FUNCTION turas_ordinary_model_operation_immutable();
 GRANT SELECT,INSERT ON ordinary_conversation_allowances TO turas_runtime;
 GRANT SELECT,INSERT,UPDATE ON ordinary_model_operations TO turas_runtime;
`);
exports.down=()=>{throw Error('Steered user deliveries require forward recovery');};
