exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_intervention_decisions(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL REFERENCES workspaces(id),
  customer_id uuid NOT NULL REFERENCES customer_references(id),engagement_id uuid NOT NULL REFERENCES engagements(id),
  proposal_id uuid NOT NULL REFERENCES execution_records(id),proposal_revision_id uuid NOT NULL REFERENCES execution_record_revisions(id),
  proposal_version bigint NOT NULL CHECK(proposal_version>0),baseline_id uuid NOT NULL REFERENCES milestone_baselines(id),
  actor_membership_id uuid NOT NULL REFERENCES memberships(id),actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),native_request_id text NOT NULL,native_call_id text NOT NULL,
  request_key uuid NOT NULL,request_digest text NOT NULL CHECK(request_digest~'^[a-f0-9]{64}$'),
  status text NOT NULL CHECK(status IN('approved','rejected','deferred')),rationale text NOT NULL CHECK(length(rationale) BETWEEN 10 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(environment_id,workspace_id,actor_membership_id,request_key),
  UNIQUE(environment_id,workspace_id,attempt_id,native_request_id)
 );
 CREATE TABLE ordinary_intervention_authorizations(
  id uuid PRIMARY KEY,decision_id uuid NOT NULL REFERENCES ordinary_intervention_decisions(id),
  environment_id text NOT NULL,workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_membership_id uuid NOT NULL REFERENCES memberships(id),actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),native_request_id text NOT NULL,native_call_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(environment_id,workspace_id,attempt_id,native_request_id),
  UNIQUE(environment_id,workspace_id,attempt_id,native_call_id)
 );
 CREATE INDEX ordinary_intervention_engagement_idx ON ordinary_intervention_decisions(environment_id,workspace_id,engagement_id,created_at DESC);
 CREATE FUNCTION turas_ordinary_intervention_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'intervention decisions are immutable' USING ERRCODE='23514';END$$;
 CREATE TRIGGER ordinary_intervention_authorization_immutable BEFORE UPDATE OR DELETE ON ordinary_intervention_authorizations FOR EACH ROW EXECUTE FUNCTION turas_ordinary_intervention_immutable();
 CREATE TRIGGER ordinary_intervention_immutable BEFORE UPDATE OR DELETE ON ordinary_intervention_decisions FOR EACH ROW EXECUTE FUNCTION turas_ordinary_intervention_immutable();
 UPDATE turas_environment SET schema_version=73 WHERE schema_version=72;
`);
exports.down=()=>{throw Error('Intervention history requires forward recovery');};
