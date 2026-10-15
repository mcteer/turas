// Legacy workspace derivatives retain their full authored contract and approval
// boundary. Source facts remain canonical profile revisions.
exports.up=pgm=>pgm.sql(`
 CREATE TABLE workspace_solution_patterns(
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),account_id uuid NOT NULL REFERENCES customer_references(id),
  pattern_id uuid NOT NULL,version integer NOT NULL CHECK(version>0),
  request_id uuid NOT NULL,request_hash text NOT NULL,
  action text NOT NULL CHECK(action IN('publish','withdraw')),
  source_record_id uuid REFERENCES profile_revisions(id),pattern jsonb,
  attestation jsonb NOT NULL,actor_user_id uuid NOT NULL REFERENCES principals(id),rationale text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  search_text tsvector,embedding vector(1536),embedding_model text,
  PRIMARY KEY(environment_id,workspace_id,pattern_id,version),
  UNIQUE(environment_id,workspace_id,account_id,request_id),
  CHECK((action='publish' AND pattern IS NOT NULL AND source_record_id IS NOT NULL) OR (action='withdraw' AND pattern IS NULL)));
 CREATE INDEX workspace_solution_patterns_text_idx ON workspace_solution_patterns USING gin(search_text);
 CREATE TABLE workspace_solution_applications(
  environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  account_id uuid NOT NULL REFERENCES customer_references(id),application_id uuid NOT NULL,
  version integer NOT NULL CHECK(version>0),request_id uuid NOT NULL,request_hash text NOT NULL,
  action text NOT NULL CHECK(action IN('approve','withdraw')),pattern_id uuid NOT NULL,pattern_version integer NOT NULL,
  context_hash text NOT NULL,assessment jsonb NOT NULL,actor_user_id uuid NOT NULL REFERENCES principals(id),
  rationale text NOT NULL,recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(environment_id,workspace_id,account_id,application_id,version),
  UNIQUE(environment_id,workspace_id,account_id,request_id),
  FOREIGN KEY(environment_id,workspace_id,pattern_id,pattern_version)
   REFERENCES workspace_solution_patterns(environment_id,workspace_id,pattern_id,version));
 GRANT SELECT,INSERT ON workspace_solution_patterns,workspace_solution_applications TO turas_runtime;
 GRANT UPDATE(embedding,embedding_model) ON workspace_solution_patterns TO turas_runtime;
`);
exports.down=()=>{throw Error('Workspace solution review history requires forward recovery');};
