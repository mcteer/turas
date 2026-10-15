exports.up=pgm=>pgm.sql(`
 CREATE TABLE public_customer_inventory_imports(
  id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),
  customer_id uuid NOT NULL,reference_version text NOT NULL,
  reviewed_on date NOT NULL,directory_url text NOT NULL,directory_listed boolean NOT NULL,
  story_count integer NOT NULL CHECK(story_count>=0),input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
  imported_by uuid NOT NULL REFERENCES memberships(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(workspace_id,customer_id,input_digest),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id));
 CREATE INDEX public_inventory_latest_idx ON public_customer_inventory_imports(workspace_id,customer_id,created_at DESC);
 CREATE TABLE public_customer_inventory_stories(
  id uuid PRIMARY KEY,import_id uuid NOT NULL REFERENCES public_customer_inventory_imports(id),
  source_revision_id uuid NOT NULL REFERENCES evidence_source_revisions(id),
  title text NOT NULL,published_on date NOT NULL,summary text NOT NULL,cautions text[] NOT NULL,
  workload text NOT NULL,products text[] NOT NULL,signals text[] NOT NULL,
  CHECK(signals <@ ARRAY['Operational trust','Platform reuse','Delivery collaboration','Measurement and learning','Product adoption']::text[]),
  UNIQUE(import_id,source_revision_id,workload));
 CREATE TRIGGER public_inventory_import_immutable BEFORE UPDATE OR DELETE ON public_customer_inventory_imports
  FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 CREATE TRIGGER public_inventory_story_immutable BEFORE UPDATE OR DELETE ON public_customer_inventory_stories
  FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
 GRANT SELECT,INSERT ON public_customer_inventory_imports,public_customer_inventory_stories TO turas_runtime;
`);
exports.down=()=>{throw Error('Dated inventory provenance requires forward recovery');};
