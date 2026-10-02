exports.up = (pgm) => {
  const scoped = (name, fields, constraints = '') => `CREATE TABLE ${name} (
    id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
    workspace_id uuid NOT NULL REFERENCES workspaces(id), ${fields},
    UNIQUE(id,environment_id,workspace_id) ${constraints ? ',' + constraints : ''});`;
  const payload = (name, parent, fields) => `CREATE TABLE ${name} (
    revision_id uuid PRIMARY KEY REFERENCES ${parent}(id), ${fields});`;
  pgm.sql([
    scoped('workforce_resources', `external_key text NOT NULL CHECK(external_key ~ '^[A-Za-z0-9_-]{1,100}$'),
      kind text NOT NULL CHECK(kind IN ('internal','partner')), membership_id uuid,
      partner_organization_id uuid, active boolean NOT NULL DEFAULT true,
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      current_revision_id uuid, created_by_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(workspace_id,external_key), UNIQUE(workspace_id,membership_id),
       FOREIGN KEY(membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       FOREIGN KEY(created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       FOREIGN KEY(partner_organization_id,workspace_id) REFERENCES partner_organizations(id,workspace_id),
       CHECK((kind='partner')=(partner_organization_id IS NOT NULL))`),
    scoped('workforce_resource_revisions', `resource_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(resource_id,revision_number), UNIQUE(id,resource_id),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    payload('workforce_resource_payloads', 'workforce_resource_revisions', `display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 160),
      timezone text NOT NULL CHECK(length(timezone) BETWEEN 1 AND 100),
      region_code text NOT NULL CHECK(region_code ~ '^[A-Za-z0-9-]{1,32}$'),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000)`),
    `ALTER TABLE workforce_resources ADD FOREIGN KEY(current_revision_id,id) REFERENCES workforce_resource_revisions(id,resource_id);`,
    scoped('workforce_partner_eligibility', `resource_id uuid NOT NULL, customer_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      from_date date NOT NULL, to_date date NOT NULL, state text NOT NULL CHECK(state IN ('active','retracted')),
      actor_membership_id uuid NOT NULL, content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(resource_id,revision_number),
       FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK(from_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31' AND to_date BETWEEN from_date AND DATE '2100-12-31')`),
    scoped('workforce_skills', `skill_key text NOT NULL CHECK(skill_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
      active boolean NOT NULL DEFAULT true, aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      current_revision_id uuid, created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(workspace_id,skill_key), FOREIGN KEY(created_by_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('workforce_skill_revisions', `skill_id uuid NOT NULL, revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'), actor_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(skill_id,revision_number), UNIQUE(id,skill_id),
       FOREIGN KEY(skill_id,environment_id,workspace_id) REFERENCES workforce_skills(id,environment_id,workspace_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    payload('workforce_skill_payloads','workforce_skill_revisions', `name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
      definition text NOT NULL CHECK(length(btrim(definition)) BETWEEN 1 AND 2000),
      rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000)`),
    `ALTER TABLE workforce_skills ADD FOREIGN KEY(current_revision_id,id) REFERENCES workforce_skill_revisions(id,skill_id);`,
    scoped('workforce_sources', `generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      state text NOT NULL CHECK(state IN ('uploading','quarantined','processing','ready','partial','failed','reviewed','cancelled','withdrawn','deleting','deleted')),
      current_version_id uuid, owner_membership_id uuid NOT NULL, owner_session_id uuid NOT NULL REFERENCES login_sessions(id),
      created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz`,
      `FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('workforce_source_versions', `source_id uuid NOT NULL, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      byte_size bigint NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
      format text NOT NULL CHECK(format IN ('csv','xlsx')),
      object_key text NOT NULL UNIQUE CHECK(object_key ~ '^[a-f0-9-]{36}$'), created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(source_id,generation), UNIQUE(id,source_id), UNIQUE(id,object_key),
       FOREIGN KEY(source_id,environment_id,workspace_id) REFERENCES workforce_sources(id,environment_id,workspace_id)`),
    payload('workforce_source_payloads','workforce_source_versions', `filename text NOT NULL CHECK(length(filename) BETWEEN 1 AND 255),
      object_key text NOT NULL UNIQUE CHECK(object_key ~ '^[a-f0-9-]{36}$'),
      FOREIGN KEY(revision_id,object_key) REFERENCES workforce_source_versions(id,object_key)`),
    `ALTER TABLE workforce_sources ADD FOREIGN KEY(current_version_id,id) REFERENCES workforce_source_versions(id,source_id);`,
    scoped('workforce_import_intents', `source_id uuid NOT NULL, owner_membership_id uuid NOT NULL,
      expected_digest text NOT NULL CHECK(expected_digest ~ '^[0-9a-f]{64}$'),
      expected_bytes bigint NOT NULL CHECK(expected_bytes BETWEEN 1 AND 10485760),
      received_bytes bigint NOT NULL DEFAULT 0 CHECK(received_bytes BETWEEN 0 AND 10485760),
      quota_released boolean NOT NULL DEFAULT false,
      staged_object_key uuid, uploaded_digest text CHECK(uploaded_digest ~ '^[0-9a-f]{64}$'),
      state text NOT NULL CHECK(state IN ('open','uploaded','completed','cancelled','expired')),
      filename text, format text NOT NULL CHECK(format IN ('csv','xlsx')),
      created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL`,
      `UNIQUE(source_id), FOREIGN KEY(source_id,environment_id,workspace_id) REFERENCES workforce_sources(id,environment_id,workspace_id),
       FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), CHECK(expires_at>created_at)`),
    scoped('workforce_import_jobs', `source_version_id uuid NOT NULL, source_generation bigint NOT NULL CHECK(source_generation BETWEEN 1 AND 9007199254740991),
      state text NOT NULL CHECK(state IN ('queued','running','ready','partial','failed','cancelled')),
      attempt_number integer NOT NULL DEFAULT 0 CHECK(attempt_number BETWEEN 0 AND 4),
      lease_token uuid, lease_expires_at timestamptz, heartbeat_at timestamptz, deadline_at timestamptz,
      parser_image_digest text CHECK(parser_image_digest ~ '^[0-9a-f]{64}$'),
      scanner_image_digest text CHECK(scanner_image_digest ~ '^[0-9a-f]{64}$'),
      error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(source_version_id), FOREIGN KEY(source_version_id,environment_id,workspace_id) REFERENCES workforce_source_versions(id,environment_id,workspace_id)`),
    scoped('workforce_extractions', `source_version_id uuid NOT NULL, job_id uuid NOT NULL,
      attempt_token uuid NOT NULL, extraction_version text NOT NULL CHECK(extraction_version='workforce-table-v1'),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      complete boolean NOT NULL, scan_clean boolean NOT NULL,
      sheet_count integer NOT NULL CHECK(sheet_count BETWEEN 1 AND 20),
      cell_count integer NOT NULL CHECK(cell_count BETWEEN 0 AND 50000),
      code_point_count integer NOT NULL CHECK(code_point_count BETWEEN 0 AND 500000),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(job_id,attempt_token), UNIQUE(id,source_version_id), FOREIGN KEY(source_version_id,environment_id,workspace_id) REFERENCES workforce_source_versions(id,environment_id,workspace_id),
       FOREIGN KEY(job_id,environment_id,workspace_id) REFERENCES workforce_import_jobs(id,environment_id,workspace_id)`),
    payload('workforce_extraction_payloads','workforce_extractions', `manifest jsonb NOT NULL CHECK(jsonb_typeof(manifest)='object' AND octet_length(manifest::text)<=8388608)`),
    scoped('workforce_extracted_cells', `extraction_id uuid NOT NULL, sheet_index integer NOT NULL CHECK(sheet_index BETWEEN 0 AND 19),
      row_number integer NOT NULL CHECK(row_number>=1), column_number integer NOT NULL CHECK(column_number>=1),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'), created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(extraction_id,sheet_index,row_number,column_number),
       FOREIGN KEY(extraction_id,environment_id,workspace_id) REFERENCES workforce_extractions(id,environment_id,workspace_id)`),
    payload('workforce_extracted_cell_payloads','workforce_extracted_cells', `cell jsonb NOT NULL CHECK(jsonb_typeof(cell)='object' AND octet_length(cell::text)<=2097152)`),
    scoped('workforce_mapping_revisions', `source_version_id uuid NOT NULL, extraction_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'), actor_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(source_version_id,revision_number), UNIQUE(id,source_version_id), FOREIGN KEY(source_version_id,environment_id,workspace_id) REFERENCES workforce_source_versions(id,environment_id,workspace_id),
       FOREIGN KEY(extraction_id,environment_id,workspace_id) REFERENCES workforce_extractions(id,environment_id,workspace_id),
       FOREIGN KEY(extraction_id,source_version_id) REFERENCES workforce_extractions(id,source_version_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    payload('workforce_mapping_payloads','workforce_mapping_revisions', `mapping jsonb NOT NULL CHECK(jsonb_typeof(mapping)='object' AND octet_length(mapping::text)<=131072)`),
    scoped('workforce_manual_evidence', `generation bigint NOT NULL DEFAULT 1 CHECK(generation BETWEEN 1 AND 9007199254740991),
      state text NOT NULL CHECK(state IN ('active','withdrawn','deleted')), actor_membership_id uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), retired_at timestamptz`,
      `FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('workforce_competencies', `resource_id uuid NOT NULL, skill_id uuid NOT NULL,
      aggregate_version bigint NOT NULL DEFAULT 1 CHECK(aggregate_version BETWEEN 1 AND 9007199254740991),
      current_accepted_revision_id uuid, current_pending_revision_id uuid,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(resource_id,skill_id), FOREIGN KEY(resource_id,environment_id,workspace_id) REFERENCES workforce_resources(id,environment_id,workspace_id),
       FOREIGN KEY(skill_id,environment_id,workspace_id) REFERENCES workforce_skills(id,environment_id,workspace_id)`),
    scoped('workforce_competency_revisions', `competency_id uuid NOT NULL,
      revision_number bigint NOT NULL CHECK(revision_number BETWEEN 1 AND 9007199254740991), level integer NOT NULL CHECK(level BETWEEN 0 AND 4),
      assessment_date date NOT NULL CHECK(assessment_date BETWEEN DATE '2000-01-01' AND DATE '2100-12-31'),
      next_review_date date NOT NULL CHECK(next_review_date BETWEEN assessment_date AND DATE '2100-12-31'),
      source_version_id uuid, manual_evidence_id uuid, source_generation bigint NOT NULL CHECK(source_generation BETWEEN 1 AND 9007199254740991),
      extraction_id uuid, mapping_revision_id uuid, row_key text NOT NULL CHECK(length(row_key) BETWEEN 1 AND 160),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      actor_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(competency_id,revision_number), UNIQUE(id,competency_id),
       FOREIGN KEY(competency_id,environment_id,workspace_id) REFERENCES workforce_competencies(id,environment_id,workspace_id),
       FOREIGN KEY(source_version_id,environment_id,workspace_id) REFERENCES workforce_source_versions(id,environment_id,workspace_id),
       FOREIGN KEY(manual_evidence_id,environment_id,workspace_id) REFERENCES workforce_manual_evidence(id,environment_id,workspace_id),
       FOREIGN KEY(extraction_id,environment_id,workspace_id) REFERENCES workforce_extractions(id,environment_id,workspace_id),
       FOREIGN KEY(extraction_id,source_version_id) REFERENCES workforce_extractions(id,source_version_id),
       FOREIGN KEY(mapping_revision_id,environment_id,workspace_id) REFERENCES workforce_mapping_revisions(id,environment_id,workspace_id),
       FOREIGN KEY(mapping_revision_id,source_version_id) REFERENCES workforce_mapping_revisions(id,source_version_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
       CHECK((source_version_id IS NOT NULL)<>(manual_evidence_id IS NOT NULL)),
       CHECK((source_version_id IS NULL AND extraction_id IS NULL AND mapping_revision_id IS NULL) OR (source_version_id IS NOT NULL AND extraction_id IS NOT NULL AND mapping_revision_id IS NOT NULL))`),
    payload('workforce_competency_payloads','workforce_competency_revisions', `evidence text NOT NULL CHECK(length(evidence) BETWEEN 1 AND 4000),
      locators jsonb NOT NULL CHECK(jsonb_typeof(locators)='array' AND octet_length(locators::text)<=8192)`),
    `ALTER TABLE workforce_competencies ADD FOREIGN KEY(current_accepted_revision_id,id) REFERENCES workforce_competency_revisions(id,competency_id);
     ALTER TABLE workforce_competencies ADD FOREIGN KEY(current_pending_revision_id,id) REFERENCES workforce_competency_revisions(id,competency_id);`,
    scoped('workforce_review_decisions', `competency_id uuid NOT NULL, revision_id uuid NOT NULL,
      action text NOT NULL CHECK(action IN ('accept','reject','retract')),
      actor_membership_id uuid NOT NULL, actor_session_id uuid NOT NULL REFERENCES login_sessions(id),
      source_generation bigint NOT NULL CHECK(source_generation BETWEEN 1 AND 9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[0-9a-f]{64}$'),
      request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'), created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(competency_id,environment_id,workspace_id) REFERENCES workforce_competencies(id,environment_id,workspace_id),
       FOREIGN KEY(revision_id,competency_id) REFERENCES workforce_competency_revisions(id,competency_id),
       FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id), UNIQUE(revision_id,action)`),
    payload('workforce_decision_payloads','workforce_review_decisions', `rationale text NOT NULL CHECK(length(btrim(rationale)) BETWEEN 1 AND 2000)`),
    scoped('workforce_command_receipts', `actor_membership_id uuid NOT NULL, request_key text NOT NULL CHECK(request_key ~ '^[A-Za-z0-9_-]{8,128}$'),
      action text NOT NULL, request_digest text NOT NULL CHECK(request_digest ~ '^[0-9a-f]{64}$'),
      result_ids jsonb NOT NULL CHECK(jsonb_typeof(result_ids)='object' AND octet_length(result_ids::text)<=16384),
      created_at timestamptz NOT NULL DEFAULT now()`,
      `UNIQUE(environment_id,workspace_id,actor_membership_id,request_key), FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)`),
    scoped('workforce_cleanup_jobs', `source_id uuid, manual_evidence_id uuid, generation bigint NOT NULL CHECK(generation BETWEEN 1 AND 9007199254740991),
      state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','failed')),
      not_before timestamptz NOT NULL, lease_token uuid, lease_expires_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()`,
      `FOREIGN KEY(source_id,environment_id,workspace_id) REFERENCES workforce_sources(id,environment_id,workspace_id),
       FOREIGN KEY(manual_evidence_id,environment_id,workspace_id) REFERENCES workforce_manual_evidence(id,environment_id,workspace_id),
       UNIQUE(source_id,generation), UNIQUE(manual_evidence_id,generation),
       CHECK((source_id IS NOT NULL)<>(manual_evidence_id IS NOT NULL))`),
    `CREATE TABLE workforce_import_quotas(environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL REFERENCES workspaces(id), reserved_bytes bigint NOT NULL DEFAULT 0 CHECK(reserved_bytes BETWEEN 0 AND 1073741824),
      PRIMARY KEY(environment_id,workspace_id));`,
    `CREATE INDEX workforce_resource_scope_idx ON workforce_resources(environment_id,workspace_id,active,id);
     CREATE INDEX workforce_competency_resource_idx ON workforce_competencies(resource_id,skill_id);
     CREATE INDEX workforce_competency_source_idx ON workforce_competency_revisions(source_version_id,source_generation);
     CREATE INDEX workforce_partner_eligibility_idx ON workforce_partner_eligibility(resource_id,customer_id,created_at DESC,id DESC);
     CREATE INDEX workforce_import_jobs_due_idx ON workforce_import_jobs(state,lease_expires_at,created_at);
     CREATE INDEX workforce_cleanup_due_idx ON workforce_cleanup_jobs(state,not_before,lease_expires_at);`,
    `CREATE FUNCTION turas_staffing_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN RAISE EXCEPTION 'staffing history is immutable' USING ERRCODE='23514'; END; $$;
     CREATE FUNCTION turas_staffing_scope_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
     BEGIN
       IF TG_OP='DELETE' OR (NEW.id,NEW.environment_id,NEW.workspace_id) IS DISTINCT FROM
         (OLD.id,OLD.environment_id,OLD.workspace_id) THEN
         RAISE EXCEPTION 'staffing identity is immutable' USING ERRCODE='23514';
       END IF; RETURN NEW;
     END; $$;
     CREATE FUNCTION turas_staffing_binding_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
     DECLARE field_name text;
     BEGIN
       FOREACH field_name IN ARRAY TG_ARGV LOOP
         IF (to_jsonb(NEW)->field_name) IS DISTINCT FROM (to_jsonb(OLD)->field_name) THEN
           RAISE EXCEPTION 'staffing binding is immutable' USING ERRCODE='23514';
         END IF;
       END LOOP; RETURN NEW;
     END; $$;`,
    `CREATE FUNCTION turas_purge_workforce_source(source_identity uuid,retired_generation bigint)
     RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
     DECLARE version_identity uuid; deleted_count integer := 0; n integer;
     BEGIN
       PERFORM 1 FROM workforce_sources WHERE id=source_identity AND generation>retired_generation FOR UPDATE;
       IF NOT FOUND THEN RETURN 0; END IF;
       FOR version_identity IN SELECT id FROM workforce_source_versions
         WHERE source_id=source_identity AND generation=retired_generation LOOP
         DELETE FROM workforce_decision_payloads WHERE revision_id IN
           (SELECT d.id FROM workforce_review_decisions d JOIN workforce_competency_revisions r ON r.id=d.revision_id
            WHERE r.source_version_id=version_identity);
         DELETE FROM workforce_competency_payloads WHERE revision_id IN
           (SELECT id FROM workforce_competency_revisions WHERE source_version_id=version_identity);
         GET DIAGNOSTICS n=ROW_COUNT; deleted_count:=deleted_count+n;
         DELETE FROM workforce_mapping_payloads WHERE revision_id IN
           (SELECT id FROM workforce_mapping_revisions WHERE source_version_id=version_identity);
         DELETE FROM workforce_extracted_cell_payloads WHERE revision_id IN
           (SELECT cell.id FROM workforce_extracted_cells cell JOIN workforce_extractions extraction
            ON extraction.id=cell.extraction_id WHERE extraction.source_version_id=version_identity);
         DELETE FROM workforce_extraction_payloads WHERE revision_id IN
           (SELECT id FROM workforce_extractions WHERE source_version_id=version_identity);
         DELETE FROM workforce_source_payloads WHERE revision_id=version_identity;
       END LOOP;
       UPDATE workforce_import_intents SET filename=NULL WHERE source_id=source_identity AND NOT EXISTS
         (SELECT 1 FROM workforce_sources s JOIN workforce_source_versions v ON v.id=s.current_version_id
          WHERE s.id=source_identity AND v.generation>retired_generation);
       RETURN deleted_count;
     END; $$;
     REVOKE ALL ON FUNCTION turas_purge_workforce_source(uuid,bigint) FROM PUBLIC;
     CREATE FUNCTION turas_purge_workforce_manual(source_identity uuid,retired_generation bigint)
     RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
     DECLARE deleted_count integer;
     BEGIN
       PERFORM 1 FROM workforce_manual_evidence WHERE id=source_identity AND generation>retired_generation FOR UPDATE;
       IF NOT FOUND THEN RETURN 0; END IF;
       DELETE FROM workforce_decision_payloads WHERE revision_id IN
         (SELECT d.id FROM workforce_review_decisions d JOIN workforce_competency_revisions r ON r.id=d.revision_id
          WHERE r.manual_evidence_id=source_identity AND r.source_generation=retired_generation);
       DELETE FROM workforce_competency_payloads WHERE revision_id IN
         (SELECT id FROM workforce_competency_revisions WHERE manual_evidence_id=source_identity AND source_generation=retired_generation);
       GET DIAGNOSTICS deleted_count=ROW_COUNT;
       RETURN deleted_count;
     END; $$;
     REVOKE ALL ON FUNCTION turas_purge_workforce_manual(uuid,bigint) FROM PUBLIC;`,
  ].join('\n'));
  for (const name of ['workforce_resources','workforce_skills','workforce_sources','workforce_import_intents',
    'workforce_import_jobs','workforce_manual_evidence','workforce_competencies','workforce_cleanup_jobs']) {
    pgm.sql(`CREATE TRIGGER ${name}_scope BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_scope_immutable();`);
  }
  for (const [name, fields] of [
    ['workforce_resources', ['external_key','kind','membership_id','partner_organization_id','created_by_membership_id']],
    ['workforce_skills', ['skill_key','created_by_membership_id']],
    ['workforce_sources', ['owner_membership_id','owner_session_id']],
    ['workforce_competencies', ['resource_id','skill_id']],
    ['workforce_import_intents', ['source_id','owner_membership_id','expected_digest','expected_bytes','format']],
    ['workforce_import_jobs', ['source_version_id','source_generation']],
    ['workforce_manual_evidence', ['actor_membership_id']],
    ['workforce_cleanup_jobs', ['source_id','manual_evidence_id','generation']],
  ]) pgm.sql(`CREATE TRIGGER ${name}_binding BEFORE UPDATE ON ${name}
    FOR EACH ROW EXECUTE FUNCTION turas_staffing_binding_immutable(${fields.map(field => `'${field}'`).join(',')});`);
  for (const name of ['workforce_resource_revisions','workforce_partner_eligibility','workforce_skill_revisions',
    'workforce_source_versions','workforce_extractions','workforce_extracted_cells','workforce_mapping_revisions',
    'workforce_competency_revisions','workforce_review_decisions','workforce_command_receipts']) {
    pgm.sql(`CREATE TRIGGER ${name}_immutable BEFORE UPDATE OR DELETE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
  for (const name of ['workforce_resource_payloads','workforce_skill_payloads','workforce_source_payloads',
    'workforce_extraction_payloads','workforce_extracted_cell_payloads','workforce_mapping_payloads',
    'workforce_competency_payloads','workforce_decision_payloads']) {
    pgm.sql(`CREATE TRIGGER ${name}_no_update BEFORE UPDATE ON ${name}
      FOR EACH ROW EXECUTE FUNCTION turas_staffing_immutable();`);
  }
};
