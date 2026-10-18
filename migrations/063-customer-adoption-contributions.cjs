exports.up=pgm=>pgm.sql(`
 CREATE TABLE customer_adoption_contributions(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),account_id uuid NOT NULL REFERENCES customer_references(id),
  quarter text NOT NULL CHECK(quarter~'^20[0-9]{2}-Q[1-4]$'),metric_id text NOT NULL,
  version integer NOT NULL CHECK(version>0),request_id uuid NOT NULL,request_hash text NOT NULL,
  action text NOT NULL CHECK(action IN('include','revoke')),source_record_id uuid REFERENCES profile_revisions(id),
  measurement jsonb,approval jsonb NOT NULL,actor_user_id uuid NOT NULL REFERENCES principals(id),rationale text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(environment_id,workspace_id,account_id,quarter,metric_id,version),
  UNIQUE(environment_id,workspace_id,account_id,request_id),
  CHECK((action='include' AND measurement IS NOT NULL AND source_record_id IS NOT NULL) OR (action='revoke' AND measurement IS NULL)));
 CREATE INDEX customer_adoption_contribution_scope_idx ON customer_adoption_contributions(environment_id,workspace_id,quarter,metric_id,account_id,version DESC);
 GRANT SELECT,INSERT ON customer_adoption_contributions TO turas_runtime;
`);
exports.down=()=>{throw Error('Customer contribution consent requires forward recovery');};
