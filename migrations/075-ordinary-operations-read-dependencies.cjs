exports.up=pgm=>pgm.sql(`
 CREATE TABLE ordinary_operations_read_dependencies(
  id uuid PRIMARY KEY,environment_id text NOT NULL,workspace_id uuid NOT NULL REFERENCES workspaces(id),
  attempt_id uuid NOT NULL REFERENCES response_attempts(id),kind text NOT NULL CHECK(kind IN('engagement','portfolio','capacity')),
  input jsonb NOT NULL CHECK(jsonb_typeof(input)='object'),
  input_digest text NOT NULL CHECK(input_digest~'^[a-f0-9]{64}$'),snapshot_digest text NOT NULL CHECK(snapshot_digest~'^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(attempt_id,kind,input_digest,snapshot_digest)
 );
 CREATE INDEX ordinary_operations_dependencies_scope ON ordinary_operations_read_dependencies(environment_id,workspace_id,attempt_id);
 CREATE FUNCTION reject_ordinary_operations_read_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Ordinary operations read dependencies are immutable' USING ERRCODE='23514'; END $$;
 CREATE TRIGGER ordinary_operations_read_immutable BEFORE UPDATE OR DELETE ON ordinary_operations_read_dependencies FOR EACH ROW EXECUTE FUNCTION reject_ordinary_operations_read_mutation();
 UPDATE turas_environment SET schema_version=75 WHERE schema_version=74;
`);
exports.down=()=>{throw Error('Explicit forward recovery required');};
