exports.up = pgm => {
  const digest = name => `${name} text NOT NULL CHECK(${name} ~ '^[a-f0-9]{64}$')`;
  const scope = `id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id), workspace_id uuid NOT NULL REFERENCES workspaces(id), customer_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,environment_id,workspace_id,customer_id), FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id)`;
  const fk = (field,parent) => `FOREIGN KEY(${field},environment_id,workspace_id,customer_id) REFERENCES ${parent}(id,environment_id,workspace_id,customer_id)`;
  pgm.sql(`
    CREATE FUNCTION turas_report_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514'; END $$;
    CREATE TABLE report_scopes(${scope}, kind text NOT NULL CHECK(kind IN ('weekly','monthly','quarterly')),
      audience text NOT NULL CHECK(audience IN ('delivery','account_team','leadership')), timezone text NOT NULL,
      from_date date NOT NULL,to_date date NOT NULL CHECK(to_date BETWEEN from_date+6 AND from_date+91),
      engagement_ids uuid[] NOT NULL CHECK(cardinality(engagement_ids) BETWEEN 1 AND 20), workload_ids uuid[] NOT NULL CHECK(cardinality(workload_ids)<=20),
      include_customer_level boolean NOT NULL, ${digest('scope_digest')}, owner_membership_id uuid NOT NULL,
      current_revision_id uuid, version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
      UNIQUE(environment_id,workspace_id,customer_id,scope_digest),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      CHECK(kind<>'weekly' OR cardinality(engagement_ids)=1));
    CREATE TABLE report_brand_profiles(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id),version bigint NOT NULL CHECK(version>=1),manifest jsonb NOT NULL,
      ${digest('manifest_digest')},${digest('font_digest')},${digest('template_digest')},
      state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','revoked')),approval_decision_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,environment_id,workspace_id),UNIQUE(environment_id,workspace_id,manifest_digest));
    CREATE TABLE report_revisions(${scope},report_id uuid NOT NULL,revision_number bigint NOT NULL CHECK(revision_number>=1),predecessor_id uuid,
      schema_version text NOT NULL,template_version text NOT NULL,projection_version text NOT NULL,formula_version text NOT NULL,
      as_of timestamptz NOT NULL,partial boolean NOT NULL,${digest('content_digest')},${digest('source_set_digest')},
      brand_id uuid NOT NULL,brand_version bigint NOT NULL CHECK(brand_version>=1),generation_watches jsonb NOT NULL,
      author_membership_id uuid NOT NULL,${fk('report_id','report_scopes')},${fk('predecessor_id','report_revisions')},
      FOREIGN KEY(author_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
      FOREIGN KEY(brand_id,environment_id,workspace_id) REFERENCES report_brand_profiles(id,environment_id,workspace_id),
      UNIQUE(report_id,revision_number),UNIQUE(id,report_id));
    ALTER TABLE report_scopes ADD CONSTRAINT report_current_revision_fk FOREIGN KEY(current_revision_id,id) REFERENCES report_revisions(id,report_id);
    CREATE TABLE report_revision_payloads(revision_id uuid PRIMARY KEY REFERENCES report_revisions(id),document jsonb NOT NULL CHECK(octet_length(document::text)<=1048576));
    CREATE TABLE report_revision_states(revision_id uuid PRIMARY KEY REFERENCES report_revisions(id),state text NOT NULL CHECK(state IN ('draft','rendering','review_ready','published','failed','cancelled')),
      visibility text NOT NULL DEFAULT 'current' CHECK(visibility IN ('current','review_required','withheld','expired')),generation bigint NOT NULL DEFAULT 1 CHECK(generation>=1),payload_expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',reason_code text,updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE report_dependencies(${scope},revision_id uuid NOT NULL,source_kind text NOT NULL,source_id uuid NOT NULL,source_revision_id uuid NOT NULL,
      decision_id uuid,engagement_id uuid,generation bigint NOT NULL CHECK(generation>=1),${digest('content_digest')},eligibility_class text NOT NULL,
      ${fk('revision_id','report_revisions')},FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),UNIQUE(revision_id,source_kind,source_revision_id));
    CREATE INDEX report_dependency_reverse ON report_dependencies(environment_id,workspace_id,source_kind,source_revision_id);
    CREATE TABLE report_calculations(revision_id uuid PRIMARY KEY REFERENCES report_revisions(id),formula_version text NOT NULL,inputs jsonb NOT NULL,results jsonb NOT NULL,${digest('input_digest')},time_decisions jsonb NOT NULL);
    CREATE TABLE report_artifacts(${scope},revision_id uuid NOT NULL,render_attempt_id uuid NOT NULL,format text NOT NULL CHECK(format IN ('pdf','pptx')),
      ${digest('content_digest')},size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),object_key uuid NOT NULL UNIQUE,
      ${digest('renderer_digest')},${digest('font_digest')},${digest('brand_digest')},${digest('template_digest')},validation_id uuid,
      ${fk('revision_id','report_revisions')},UNIQUE(revision_id,render_attempt_id,format));
    CREATE TABLE report_validations(${scope},revision_id uuid NOT NULL,${digest('document_digest')},artifact_digests jsonb NOT NULL,${digest('mail_digest')},
      validator_version text NOT NULL,checks jsonb NOT NULL,${fk('revision_id','report_revisions')});
    ALTER TABLE report_artifacts ADD CONSTRAINT report_artifact_validation_fk FOREIGN KEY(validation_id,environment_id,workspace_id,customer_id) REFERENCES report_validations(id,environment_id,workspace_id,customer_id);
    CREATE TABLE report_decisions(${scope},actor_membership_id uuid NOT NULL,action text NOT NULL CHECK(action IN ('publish','reject','withdraw','approve_brand','revoke_brand','approve_policy','pause_policy','resume_policy','revoke_policy','authorize_send','reconcile')),
      subject_id uuid NOT NULL,expected_version bigint NOT NULL CHECK(expected_version>=1),${digest('preview_digest')},${digest('rationale_digest')},request_key uuid NOT NULL,
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
    CREATE TABLE report_decision_payloads(decision_id uuid PRIMARY KEY REFERENCES report_decisions(id),revision_id uuid REFERENCES report_revisions(id),rationale text NOT NULL CHECK(length(rationale) BETWEEN 1 AND 2000),expires_at timestamptz NOT NULL);
    CREATE TRIGGER report_decision_payloads_no_update BEFORE UPDATE ON report_decision_payloads FOR EACH ROW EXECUTE FUNCTION turas_report_immutable();
    CREATE TABLE report_command_receipts(${scope},actor_membership_id uuid NOT NULL,request_key uuid NOT NULL,action text NOT NULL,${digest('input_digest')},result_ids jsonb NOT NULL,
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(environment_id,workspace_id,actor_membership_id,request_key));
    CREATE TABLE report_previews(${scope},actor_membership_id uuid NOT NULL,subject_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('publication','send','brand','policy')),
      expected_version bigint NOT NULL CHECK(expected_version>=1),${digest('binding_digest')},expires_at timestamptz NOT NULL,
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
    CREATE TABLE report_rate_windows(environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
      bucket text NOT NULL,window_start timestamptz NOT NULL,count integer NOT NULL CHECK(count>=0),PRIMARY KEY(environment_id,workspace_id,bucket,window_start));
    CREATE FUNCTION turas_report_scope_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'current_revision_id'-'version') IS DISTINCT FROM (to_jsonb(OLD)-'current_revision_id'-'version') THEN RAISE EXCEPTION 'report scope immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER report_scope_identity BEFORE UPDATE OR DELETE ON report_scopes FOR EACH ROW EXECUTE FUNCTION turas_report_scope_identity();
 CREATE FUNCTION turas_report_brand_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'approval_decision_id') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'approval_decision_id') THEN RAISE EXCEPTION 'brand identity immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER report_brand_identity BEFORE UPDATE OR DELETE ON report_brand_profiles FOR EACH ROW EXECUTE FUNCTION turas_report_brand_identity();
 CREATE INDEX report_scope_list ON report_scopes(environment_id,workspace_id,customer_id,created_at DESC,id);
  `);
  for(const table of ['report_revisions','report_dependencies','report_calculations','report_validations','report_decisions','report_command_receipts','report_previews','report_artifacts'])
    pgm.sql(`CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION turas_report_immutable();`);
  pgm.sql('CREATE TRIGGER report_payload_no_update BEFORE UPDATE ON report_revision_payloads FOR EACH ROW EXECUTE FUNCTION turas_report_immutable();');
};
exports.down=()=>{throw new Error('Report migrations are forward-only');};
