exports.up = (pgm) => pgm.sql(`
 ALTER TABLE workspaces ADD COLUMN classification text NOT NULL DEFAULT 'primary'
  CHECK(classification IN('primary','synthetic_pilot'));
 ALTER TABLE workspaces ADD COLUMN pilot_environment_id text REFERENCES turas_environment(environment_id);
 ALTER TABLE workspaces ADD COLUMN pilot_provisioning_id uuid;
 ALTER TABLE workspaces ADD CONSTRAINT pilot_workspace_identity CHECK(
  (classification='primary' AND pilot_environment_id IS NULL AND pilot_provisioning_id IS NULL) OR
  (classification='synthetic_pilot' AND pilot_environment_id IS NOT NULL AND pilot_provisioning_id IS NOT NULL));
 CREATE UNIQUE INDEX one_active_pilot_workspace ON workspaces(pilot_environment_id)
  WHERE active AND classification='synthetic_pilot';
 CREATE FUNCTION turas_workspace_classification_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
  IF ROW(NEW.classification,NEW.pilot_environment_id,NEW.pilot_provisioning_id) IS DISTINCT FROM
     ROW(OLD.classification,OLD.pilot_environment_id,OLD.pilot_provisioning_id) THEN
   RAISE EXCEPTION 'Workspace provenance is immutable';
  END IF; RETURN NEW;
 END $$;
 CREATE TRIGGER workspace_classification_immutable BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION turas_workspace_classification_immutable();
 ALTER TABLE login_sessions ADD COLUMN membership_id uuid;
 ALTER TABLE login_sessions ADD COLUMN workspace_id uuid;
 ALTER TABLE login_sessions ADD CONSTRAINT session_binding_pair CHECK((membership_id IS NULL)=(workspace_id IS NULL));
 ALTER TABLE login_sessions ADD CONSTRAINT session_exact_membership
  FOREIGN KEY(membership_id,principal_id,workspace_id) REFERENCES memberships(id,principal_id,workspace_id);
 WITH candidates AS (
  SELECT m.principal_id,min(m.id::text)::uuid AS membership_id,min(m.workspace_id::text)::uuid AS workspace_id
  FROM memberships m JOIN workspaces w ON w.id=m.workspace_id JOIN principals p ON p.id=m.principal_id
  LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
  WHERE m.active AND w.active AND p.active AND w.classification='primary'
   AND (m.kind='internal' OR o.active) GROUP BY m.principal_id HAVING count(*)=1
 ) UPDATE login_sessions s SET membership_id=c.membership_id,workspace_id=c.workspace_id
  FROM candidates c WHERE c.principal_id=s.principal_id;
 UPDATE login_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE membership_id IS NULL;
 CREATE INDEX session_bound_membership ON login_sessions(membership_id,workspace_id) WHERE revoked_at IS NULL;
 ALTER TABLE knowledge_publications ADD COLUMN origin_workspace_id uuid REFERENCES workspaces(id);
 ALTER TABLE knowledge_publications ADD COLUMN origin_classification text CHECK(origin_classification IN('primary','synthetic_pilot'));
 ALTER TABLE knowledge_publications ADD CONSTRAINT publication_origin_pair CHECK((origin_workspace_id IS NULL)=(origin_classification IS NULL));
 UPDATE knowledge_publications p SET origin_workspace_id=c.workspace_id,origin_classification=w.classification
  FROM knowledge_contributions c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=p.contribution_id;
 UPDATE knowledge_publications SET state='suspended',head_generation=head_generation+1,updated_at=now()
  WHERE origin_workspace_id IS NULL AND state='published';
 CREATE FUNCTION turas_publication_origin() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE source_workspace uuid; source_class text;
 BEGIN
  SELECT c.workspace_id,w.classification INTO source_workspace,source_class
   FROM knowledge_contributions c JOIN workspaces w ON w.id=c.workspace_id WHERE c.id=NEW.contribution_id;
  IF source_workspace IS NULL THEN RAISE EXCEPTION 'Missing publication provenance'; END IF;
  IF TG_OP='UPDATE' AND (NEW.contribution_id IS DISTINCT FROM OLD.contribution_id OR
     ROW(NEW.origin_workspace_id,NEW.origin_classification) IS DISTINCT FROM ROW(OLD.origin_workspace_id,OLD.origin_classification)) THEN
   RAISE EXCEPTION 'Publication provenance is immutable';
  END IF;
  IF NEW.origin_workspace_id IS NOT NULL AND NEW.origin_workspace_id<>source_workspace OR
     NEW.origin_classification IS NOT NULL AND NEW.origin_classification<>source_class THEN
   RAISE EXCEPTION 'Publication provenance mismatch';
  END IF;
  NEW.origin_workspace_id=source_workspace; NEW.origin_classification=source_class; RETURN NEW;
 END $$;
 CREATE TRIGGER publication_origin BEFORE INSERT OR UPDATE ON knowledge_publications
  FOR EACH ROW EXECUTE FUNCTION turas_publication_origin();

 ALTER TABLE retrieval_sources ADD COLUMN origin_workspace_id uuid REFERENCES workspaces(id);
 ALTER TABLE retrieval_sources ADD COLUMN origin_classification text CHECK(origin_classification IN('primary','synthetic_pilot'));
 ALTER TABLE retrieval_sources ADD CONSTRAINT retrieval_origin_pair CHECK((origin_workspace_id IS NULL)=(origin_classification IS NULL));
 WITH origins AS (
  SELECT s.id,v.workspace_id FROM retrieval_sources s JOIN profile_revisions v ON v.id=s.source_revision_id WHERE s.source_kind='accepted_profile'
  UNION ALL SELECT s.id,v.workspace_id FROM retrieval_sources s JOIN artifact_evidence_selections v ON v.id=s.source_revision_id WHERE s.source_kind='approved_excerpt'
  UNION ALL SELECT s.id,v.workspace_id FROM retrieval_sources s JOIN evidence_source_revisions v ON v.id=s.source_revision_id WHERE s.source_kind='verified_research'
  UNION ALL SELECT s.id,c.workspace_id FROM retrieval_sources s JOIN knowledge_revisions r ON r.id=s.source_revision_id JOIN knowledge_contributions c ON c.id=r.contribution_id WHERE s.source_kind='published_shared'
 ) UPDATE retrieval_sources s SET origin_workspace_id=o.workspace_id,origin_classification=w.classification
  FROM origins o JOIN workspaces w ON w.id=o.workspace_id WHERE o.id=s.id AND (s.scope='shared' OR s.workspace_id=o.workspace_id);
 UPDATE retrieval_sources SET lifecycle_state='retired',updated_at=now() WHERE origin_workspace_id IS NULL AND lifecycle_state='current';
 CREATE FUNCTION turas_retrieval_origin() RETURNS trigger LANGUAGE plpgsql AS $$
 DECLARE source_workspace uuid; source_class text;
 BEGIN
  IF TG_OP='UPDATE' AND ROW(NEW.origin_workspace_id,NEW.origin_classification) IS DISTINCT FROM ROW(OLD.origin_workspace_id,OLD.origin_classification)
   THEN RAISE EXCEPTION 'Retrieval provenance is immutable'; END IF;
  IF NEW.source_kind='accepted_profile' THEN SELECT workspace_id INTO source_workspace FROM profile_revisions WHERE id=NEW.source_revision_id;
  ELSIF NEW.source_kind='approved_excerpt' THEN SELECT workspace_id INTO source_workspace FROM artifact_evidence_selections WHERE id=NEW.source_revision_id;
  ELSIF NEW.source_kind='verified_research' THEN SELECT workspace_id INTO source_workspace FROM evidence_source_revisions WHERE id=NEW.source_revision_id;
  ELSIF NEW.source_kind='published_shared' THEN SELECT c.workspace_id INTO source_workspace FROM knowledge_revisions r JOIN knowledge_contributions c ON c.id=r.contribution_id WHERE r.id=NEW.source_revision_id;
  END IF;
  IF source_workspace IS NULL THEN
   IF TG_OP='UPDATE' AND OLD.origin_workspace_id IS NULL AND NEW.lifecycle_state<>'current' THEN RETURN NEW; END IF;
   RAISE EXCEPTION 'Missing retrieval provenance';
  END IF;
  SELECT classification INTO source_class FROM workspaces WHERE id=source_workspace;
  IF NEW.scope='customer' AND NEW.workspace_id IS DISTINCT FROM source_workspace OR
     NEW.origin_workspace_id IS NOT NULL AND NEW.origin_workspace_id<>source_workspace OR
     NEW.origin_classification IS NOT NULL AND NEW.origin_classification<>source_class THEN
   RAISE EXCEPTION 'Retrieval provenance mismatch';
  END IF;
  NEW.origin_workspace_id=source_workspace;NEW.origin_classification=source_class;RETURN NEW;
 END $$;
 CREATE TRIGGER retrieval_origin BEFORE INSERT OR UPDATE ON retrieval_sources FOR EACH ROW EXECUTE FUNCTION turas_retrieval_origin();
`);
