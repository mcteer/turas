exports.up=pgm=>pgm.sql(`
 CREATE TABLE specialist_discussions (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  owner_principal_id uuid NOT NULL REFERENCES principals(id),
  customer_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN('customer-update','solution','best-practices')),
  workload text NOT NULL CHECK(length(trim(workload)) BETWEEN 1 AND 160),
  parent_session_id text NOT NULL,
  first_call_id text NOT NULL,
  workflow_run_id text NOT NULL UNIQUE,
  control_hook_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  child_session_id text UNIQUE,
  native_task_id text,
  original_attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  original_lease_id uuid NOT NULL,
  context_digest text NOT NULL CHECK(context_digest ~ '^[0-9a-f]{64}$'),
  authority_digest text NOT NULL CHECK(authority_digest ~ '^[0-9a-f]{64}$'),
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(dependencies)='array'),
  state text NOT NULL DEFAULT 'open' CHECK(state IN('open','stopping','closed','failed','expired')),
  input_ceiling bigint NOT NULL CHECK(input_ceiling>0),
  output_ceiling bigint NOT NULL CHECK(output_ceiling>0),
  cost_ceiling_micro_usd bigint NOT NULL CHECK(cost_ceiling_micro_usd>0),
  version bigint NOT NULL DEFAULT 0 CHECK(version>=0),
  projection_line bigint NOT NULL DEFAULT -1 CHECK(projection_line>=-1),
  projection_fact_index integer NOT NULL DEFAULT -1 CHECK(projection_fact_index>=-1),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  closed_at timestamptz,
  close_reason text,
  control_next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  control_attempts integer NOT NULL DEFAULT 0 CHECK(control_attempts>=0),
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '10 minutes'),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  UNIQUE(parent_session_id,first_call_id),UNIQUE(id,parent_session_id)
 );
 CREATE INDEX specialist_discussion_owner_idx ON specialist_discussions(environment_id,workspace_id,owner_principal_id,conversation_id,created_at DESC,id);
 CREATE INDEX specialist_discussion_expiry_idx ON specialist_discussions(expires_at) WHERE state IN('open','stopping');
 CREATE TABLE specialist_assignments (
  id uuid PRIMARY KEY,
  discussion_id uuid NOT NULL REFERENCES specialist_discussions(id),
  parent_session_id text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal>0),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),
  request_key uuid NOT NULL,
  input_digest text NOT NULL CHECK(input_digest ~ '^[0-9a-f]{64}$'),
  call_id text NOT NULL,
  native_delivery_id text,
  child_turn_id text,
  research_key text NOT NULL,
  lease_id uuid NOT NULL UNIQUE,
  authority_expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'admitted' CHECK(state IN('admitted','working','waiting_input','stopping','completed','failed','cancelled','unavailable')),
  result_reference jsonb,
  reason_code text,
  terminal_line bigint CHECK(terminal_line>=0),
  terminal_index integer CHECK(terminal_index>=0),
  result_delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(id,discussion_id),UNIQUE(discussion_id,ordinal),UNIQUE(parent_session_id,call_id),UNIQUE(discussion_id,request_key),
  FOREIGN KEY(discussion_id,parent_session_id) REFERENCES specialist_discussions(id,parent_session_id)
 );
 CREATE UNIQUE INDEX specialist_one_active_assignment ON specialist_assignments(discussion_id)
  WHERE state IN('admitted','working','waiting_input','stopping');
 CREATE TABLE specialist_operations (
  id uuid PRIMARY KEY,
  discussion_id uuid NOT NULL REFERENCES specialist_discussions(id),
  assignment_id uuid NOT NULL,
  native_step_key text NOT NULL UNIQUE,
  model text NOT NULL,
  ceiling_input_tokens bigint NOT NULL CHECK(ceiling_input_tokens>=0),
  ceiling_output_tokens bigint NOT NULL CHECK(ceiling_output_tokens>=0),
  ceiling_micro_usd bigint NOT NULL CHECK(ceiling_micro_usd>=0),
  actual_input_tokens bigint CHECK(actual_input_tokens>=0),
  actual_output_tokens bigint CHECK(actual_output_tokens>=0),
  actual_micro_usd bigint CHECK(actual_micro_usd>=0),
  pricing jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  settled_at timestamptz,
  FOREIGN KEY(assignment_id,discussion_id) REFERENCES specialist_assignments(id,discussion_id),
  CHECK((settled_at IS NULL)=(actual_input_tokens IS NULL AND actual_output_tokens IS NULL AND actual_micro_usd IS NULL)),
  CHECK(settled_at IS NULL OR (actual_input_tokens IS NOT NULL AND actual_output_tokens IS NOT NULL AND actual_micro_usd IS NOT NULL))
 );
 CREATE INDEX specialist_operations_discussion_idx ON specialist_operations(discussion_id);
 CREATE FUNCTION turas_specialist_operation_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF ROW(NEW.id,NEW.discussion_id,NEW.assignment_id,NEW.native_step_key,NEW.model,NEW.ceiling_input_tokens,NEW.ceiling_output_tokens,NEW.ceiling_micro_usd,NEW.pricing,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.discussion_id,OLD.assignment_id,OLD.native_step_key,OLD.model,OLD.ceiling_input_tokens,OLD.ceiling_output_tokens,OLD.ceiling_micro_usd,OLD.pricing,OLD.created_at)
   OR (OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at)
   OR (OLD.settled_at IS NOT NULL AND ROW(NEW.actual_input_tokens,NEW.actual_output_tokens,NEW.actual_micro_usd,NEW.settled_at)
     IS DISTINCT FROM ROW(OLD.actual_input_tokens,OLD.actual_output_tokens,OLD.actual_micro_usd,OLD.settled_at)) THEN
   RAISE EXCEPTION 'immutable specialist operation' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END; $$;
 CREATE TRIGGER specialist_operation_immutable BEFORE UPDATE ON specialist_operations FOR EACH ROW EXECUTE FUNCTION turas_specialist_operation_immutable();
 CREATE FUNCTION turas_specialist_scope() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM conversations c JOIN response_attempts a ON a.conversation_id=c.id
    WHERE c.id=NEW.conversation_id AND a.id=NEW.original_attempt_id
     AND c.environment_id=NEW.environment_id AND c.workspace_id=NEW.workspace_id
     AND c.owner_principal_id=NEW.owner_principal_id AND c.eve_session_id=NEW.parent_session_id
     AND (c.customer_id IS NULL OR c.customer_id=NEW.customer_id)) THEN
   RAISE EXCEPTION 'invalid specialist scope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
   ROW(NEW.id,NEW.conversation_id,NEW.environment_id,NEW.workspace_id,NEW.owner_principal_id,NEW.customer_id,NEW.kind,NEW.workload,NEW.parent_session_id,NEW.first_call_id,NEW.workflow_run_id,NEW.control_hook_token,NEW.original_attempt_id,NEW.original_lease_id,NEW.authority_digest,NEW.expires_at,NEW.created_at,NEW.input_ceiling,NEW.output_ceiling,NEW.cost_ceiling_micro_usd)
   IS DISTINCT FROM ROW(OLD.id,OLD.conversation_id,OLD.environment_id,OLD.workspace_id,OLD.owner_principal_id,OLD.customer_id,OLD.kind,OLD.workload,OLD.parent_session_id,OLD.first_call_id,OLD.workflow_run_id,OLD.control_hook_token,OLD.original_attempt_id,OLD.original_lease_id,OLD.authority_digest,OLD.expires_at,OLD.created_at,OLD.input_ceiling,OLD.output_ceiling,OLD.cost_ceiling_micro_usd)
   OR (OLD.child_session_id IS NOT NULL AND NEW.child_session_id IS DISTINCT FROM OLD.child_session_id)
   OR (OLD.native_task_id IS NOT NULL AND NEW.native_task_id IS DISTINCT FROM OLD.native_task_id)
   OR (OLD.state<>'open' AND NEW.state='open')) THEN
   RAISE EXCEPTION 'immutable specialist binding' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END; $$;
 CREATE TRIGGER specialist_scope BEFORE INSERT OR UPDATE ON specialist_discussions FOR EACH ROW EXECUTE FUNCTION turas_specialist_scope();
 CREATE FUNCTION turas_specialist_assignment_scope() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF NOT EXISTS(SELECT 1 FROM specialist_discussions d JOIN response_attempts a ON a.conversation_id=d.conversation_id
   WHERE d.id=NEW.discussion_id AND a.id=NEW.attempt_id AND NEW.authority_expires_at<=d.expires_at) THEN
   RAISE EXCEPTION 'invalid specialist assignment scope' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND (
   ROW(NEW.id,NEW.parent_session_id,NEW.discussion_id,NEW.ordinal,NEW.attempt_id,NEW.request_key,NEW.input_digest,NEW.call_id,NEW.research_key,NEW.lease_id,NEW.authority_expires_at,NEW.created_at)
   IS DISTINCT FROM ROW(OLD.id,OLD.parent_session_id,OLD.discussion_id,OLD.ordinal,OLD.attempt_id,OLD.request_key,OLD.input_digest,OLD.call_id,OLD.research_key,OLD.lease_id,OLD.authority_expires_at,OLD.created_at)
   OR (OLD.native_delivery_id IS NOT NULL AND NEW.native_delivery_id IS DISTINCT FROM OLD.native_delivery_id)
   OR (OLD.child_turn_id IS NOT NULL AND NEW.child_turn_id IS DISTINCT FROM OLD.child_turn_id)
   OR (OLD.terminal_line IS NOT NULL AND NEW.terminal_line IS DISTINCT FROM OLD.terminal_line)
   OR (OLD.terminal_index IS NOT NULL AND NEW.terminal_index IS DISTINCT FROM OLD.terminal_index)
   OR (OLD.result_reference IS NOT NULL AND NEW.result_reference IS DISTINCT FROM OLD.result_reference)
   OR (OLD.result_delivered_at IS NOT NULL AND NEW.result_delivered_at IS DISTINCT FROM OLD.result_delivered_at)
   OR (OLD.state IN('completed','failed','cancelled','unavailable') AND NEW.state IS DISTINCT FROM OLD.state)) THEN
   RAISE EXCEPTION 'immutable specialist assignment' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END; $$;
 CREATE TRIGGER specialist_assignment_scope BEFORE INSERT OR UPDATE ON specialist_assignments FOR EACH ROW EXECUTE FUNCTION turas_specialist_assignment_scope();
 UPDATE turas_environment SET schema_version=84 WHERE schema_version=83;
`);
exports.down=()=>{throw Error('Specialist discussion authority requires explicit forward recovery');};
