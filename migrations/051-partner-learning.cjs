exports.up=pgm=>pgm.sql(`
 CREATE TABLE partner_learning_assignments(
  id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,customer_id uuid NOT NULL,
  guide_id uuid NOT NULL,guide_revision_id uuid NOT NULL,accepted_plan_revision_id uuid NOT NULL REFERENCES plan_revisions(id),baseline_id uuid NOT NULL REFERENCES milestone_baselines(id),
  membership_id uuid NOT NULL,membership_revision bigint NOT NULL CHECK(membership_revision>=0),organization_id uuid NOT NULL REFERENCES partner_organizations(id),organization_revision bigint NOT NULL CHECK(organization_revision>0),grant_revision bigint NOT NULL CHECK(grant_revision>=0),
  creator_membership_id uuid,created_at timestamptz DEFAULT clock_timestamp(),state text NOT NULL DEFAULT 'active' CHECK(state IN('active','withdrawn','superseded')),version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
  predecessor_id uuid REFERENCES partner_learning_assignments(id),successor_id uuid REFERENCES partner_learning_assignments(id),obsolete_at timestamptz,purge_at timestamptz,eligibility_recheck_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(guide_id,customer_id,workspace_id) REFERENCES partner_guides(id,customer_id,workspace_id),FOREIGN KEY(guide_id,environment_id,workspace_id) REFERENCES partner_guides(id,environment_id,workspace_id),FOREIGN KEY(guide_revision_id,guide_id) REFERENCES partner_guide_revisions(id,guide_id),
  FOREIGN KEY(guide_revision_id,guide_id,accepted_plan_revision_id,baseline_id) REFERENCES partner_guide_revisions(id,guide_id,accepted_plan_revision_id,baseline_id),
  FOREIGN KEY(membership_id,workspace_id) REFERENCES memberships(id,workspace_id),FOREIGN KEY(creator_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),UNIQUE(id,environment_id,workspace_id),UNIQUE(id,guide_id,guide_revision_id));
 CREATE UNIQUE INDEX partner_learning_one_active ON partner_learning_assignments(membership_id,guide_id) WHERE state='active';
 CREATE FUNCTION turas_partner_assignment_cap() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  PERFORM id FROM memberships WHERE id=NEW.membership_id FOR UPDATE;
  IF NEW.state='active' AND (SELECT count(*) FROM partner_learning_assignments WHERE membership_id=NEW.membership_id AND customer_id=NEW.customer_id AND state='active')>=100 THEN RAISE EXCEPTION 'Partner assignment limit reached' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_assignment_cap BEFORE INSERT ON partner_learning_assignments FOR EACH ROW EXECUTE FUNCTION turas_partner_assignment_cap();
 CREATE INDEX partner_learning_member_customer ON partner_learning_assignments(environment_id,workspace_id,customer_id,membership_id,id);
 CREATE TABLE partner_assignment_payloads(assignment_id uuid PRIMARY KEY REFERENCES partner_learning_assignments(id),content json NOT NULL CHECK(octet_length(content::text)<=16384));
 CREATE TABLE partner_checkpoint_attempts(id uuid PRIMARY KEY,assignment_id uuid NOT NULL REFERENCES partner_learning_assignments(id),checkpoint_id uuid NOT NULL,attempt_number bigint NOT NULL CHECK(attempt_number>0),
  state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','submitted','request_changes','verified')),head_revision_id uuid,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(assignment_id,checkpoint_id,attempt_number),UNIQUE(id,assignment_id));
 CREATE UNIQUE INDEX partner_checkpoint_one_open ON partner_checkpoint_attempts(assignment_id,checkpoint_id) WHERE state IN('draft','submitted');
 CREATE UNIQUE INDEX partner_checkpoint_one_verified ON partner_checkpoint_attempts(assignment_id,checkpoint_id) WHERE state='verified';
 CREATE TABLE partner_checkpoint_revisions(id uuid PRIMARY KEY,attempt_id uuid NOT NULL REFERENCES partner_checkpoint_attempts(id),revision_number bigint NOT NULL CHECK(revision_number>0),author_membership_id uuid REFERENCES memberships(id),created_at timestamptz DEFAULT clock_timestamp(),observed_at timestamptz NOT NULL,
  content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),contract_version text NOT NULL DEFAULT 'partner-enablement-v1' CHECK(contract_version='partner-enablement-v1'),UNIQUE(attempt_id,revision_number),UNIQUE(id,attempt_id));
 ALTER TABLE partner_checkpoint_attempts ADD FOREIGN KEY(head_revision_id,id) REFERENCES partner_checkpoint_revisions(id,attempt_id);
 CREATE TABLE partner_checkpoint_payloads(revision_id uuid PRIMARY KEY REFERENCES partner_checkpoint_revisions(id),content json NOT NULL CHECK(octet_length(content::text)<=131072));
 CREATE FUNCTION turas_partner_checkpoint_author() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM partner_checkpoint_attempts t JOIN partner_learning_assignments a ON a.id=t.assignment_id WHERE t.id=NEW.attempt_id AND a.membership_id=NEW.author_membership_id) OR NEW.observed_at>clock_timestamp() THEN RAISE EXCEPTION 'Partner checkpoint author or observation mismatch' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_checkpoint_author BEFORE INSERT ON partner_checkpoint_revisions FOR EACH ROW EXECUTE FUNCTION turas_partner_checkpoint_author();
 CREATE TABLE partner_checkpoint_revision_states(revision_id uuid PRIMARY KEY REFERENCES partner_checkpoint_revisions(id),generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),invalidated_at timestamptz,obsolete_at timestamptz,purge_at timestamptz,eligibility_recheck_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX partner_assignment_purge_due ON partner_learning_assignments(purge_at,id) WHERE purge_at IS NOT NULL;
 CREATE INDEX partner_checkpoint_purge_due ON partner_checkpoint_revision_states(purge_at,revision_id) WHERE purge_at IS NOT NULL;
 CREATE INDEX partner_checkpoint_recheck ON partner_checkpoint_revision_states(eligibility_recheck_at,revision_id);
 CREATE TRIGGER partner_earliest_deadline BEFORE UPDATE ON partner_checkpoint_revision_states FOR EACH ROW EXECUTE FUNCTION turas_partner_earliest_deadline();
 CREATE TRIGGER partner_earliest_deadline BEFORE UPDATE ON partner_learning_assignments FOR EACH ROW EXECUTE FUNCTION turas_partner_earliest_deadline();
 ALTER TABLE partner_source_dependencies ADD FOREIGN KEY(checkpoint_revision_id) REFERENCES partner_checkpoint_revisions(id);
 CREATE INDEX partner_checkpoint_sources ON partner_source_dependencies(checkpoint_revision_id);
 ALTER TABLE partner_review_decisions ADD FOREIGN KEY(assignment_id,guide_id,guide_revision_id) REFERENCES partner_learning_assignments(id,guide_id,guide_revision_id);
 ALTER TABLE partner_review_decisions ADD FOREIGN KEY(checkpoint_revision_id) REFERENCES partner_checkpoint_revisions(id);
 CREATE UNIQUE INDEX partner_checkpoint_one_decision ON partner_review_decisions(checkpoint_revision_id) WHERE checkpoint_revision_id IS NOT NULL;
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['partner_assignment_payloads','partner_checkpoint_revisions','partner_checkpoint_payloads'] LOOP EXECUTE format('CREATE TRIGGER partner_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_partner_immutable()',t);END LOOP;END $$;
 CREATE FUNCTION turas_partner_assignment_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.guide_id,NEW.guide_revision_id,NEW.accepted_plan_revision_id,NEW.baseline_id,NEW.membership_id,NEW.membership_revision,NEW.organization_id,NEW.organization_revision,NEW.grant_revision,NEW.predecessor_id,NEW.creator_membership_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.guide_id,OLD.guide_revision_id,OLD.accepted_plan_revision_id,OLD.baseline_id,OLD.membership_id,OLD.membership_revision,OLD.organization_id,OLD.organization_revision,OLD.grant_revision,OLD.predecessor_id,OLD.creator_membership_id,OLD.created_at) OR (OLD.state<>'active' AND NEW.state<>OLD.state) THEN RAISE EXCEPTION 'Partner assignment identity is immutable' USING ERRCODE='23514';END IF;
  RETURN NEW;END $$;
 CREATE TRIGGER partner_assignment_identity BEFORE UPDATE ON partner_learning_assignments FOR EACH ROW EXECUTE FUNCTION turas_partner_assignment_identity();
 CREATE FUNCTION turas_partner_checkpoint_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW.assignment_id,NEW.checkpoint_id,NEW.attempt_number,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.assignment_id,OLD.checkpoint_id,OLD.attempt_number,OLD.created_at) OR (OLD.state IN('verified','request_changes') AND (NEW.state,NEW.head_revision_id) IS DISTINCT FROM (OLD.state,OLD.head_revision_id)) OR (OLD.state='submitted' AND NEW.head_revision_id IS DISTINCT FROM OLD.head_revision_id) THEN RAISE EXCEPTION 'Partner checkpoint history is frozen' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_checkpoint_identity BEFORE UPDATE ON partner_checkpoint_attempts FOR EACH ROW EXECUTE FUNCTION turas_partner_checkpoint_identity();
 CREATE FUNCTION turas_partner_assignment_authority_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE members uuid[]; BEGIN
  IF TG_TABLE_NAME='memberships' THEN
   IF NEW.revision IS NOT DISTINCT FROM OLD.revision THEN RETURN NEW;END IF;members=ARRAY[OLD.id];
  ELSIF TG_TABLE_NAME='partner_organizations' THEN
   IF NEW.authority_revision IS NOT DISTINCT FROM OLD.authority_revision THEN RETURN NEW;END IF;SELECT array_agg(id ORDER BY id) INTO members FROM public.memberships WHERE partner_org_id=OLD.id;
  ELSIF TG_TABLE_NAME='customer_grants' THEN
   IF (NEW.revision,NEW.state) IS NOT DISTINCT FROM (OLD.revision,OLD.state) THEN RETURN NEW;END IF;
   UPDATE public.partner_learning_assignments SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '90 days') WHERE membership_id=OLD.membership_id AND customer_id=OLD.customer_id AND state='active';RETURN NEW;
  ELSIF TG_TABLE_NAME='principals' THEN
   IF NEW.active IS NOT DISTINCT FROM OLD.active THEN RETURN NEW;END IF;SELECT array_agg(id ORDER BY id) INTO members FROM public.memberships WHERE principal_id=OLD.id;
  ELSIF TG_TABLE_NAME='partner_guides' THEN
   IF NEW.published_revision_id IS NOT DISTINCT FROM OLD.published_revision_id THEN RETURN NEW;END IF;
   UPDATE public.partner_learning_assignments SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '90 days') WHERE guide_id=OLD.id AND guide_revision_id=OLD.published_revision_id AND state='active';RETURN NEW;
  ELSE
   IF NEW.active IS NOT DISTINCT FROM OLD.active THEN RETURN NEW;END IF;SELECT array_agg(id ORDER BY id) INTO members FROM public.memberships WHERE workspace_id=OLD.id;
  END IF;
  UPDATE public.partner_learning_assignments SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval '90 days') WHERE membership_id=ANY(members) AND state='active';RETURN NEW;END $$;
 REVOKE ALL ON FUNCTION turas_partner_assignment_authority_change() FROM PUBLIC;
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['memberships','partner_organizations','customer_grants','principals','workspaces','partner_guides'] LOOP EXECUTE format('CREATE TRIGGER partner_assignment_authority_change AFTER UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION turas_partner_assignment_authority_change()',t);END LOOP;END $$;
 CREATE FUNCTION turas_partner_purge_learning(expected_environment text,batch_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE affected integer:=0;n integer; BEGIN
  IF batch_limit NOT BETWEEN 1 AND 100 OR NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment AND schema_version>=51) THEN RAISE EXCEPTION 'Invalid partner maintenance scope';END IF;
  PERFORM set_config('turas.partner_cleanup','yes',true);
  DELETE FROM public.partner_checkpoint_payloads WHERE revision_id IN(SELECT s.revision_id FROM public.partner_checkpoint_revision_states s JOIN public.partner_checkpoint_revisions r ON r.id=s.revision_id JOIN public.partner_checkpoint_attempts t ON t.id=r.attempt_id JOIN public.partner_learning_assignments a ON a.id=t.assignment_id WHERE a.environment_id=expected_environment AND LEAST(s.purge_at,a.purge_at)<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.partner_cleanup_jobs j WHERE j.environment_id=expected_environment AND j.kind='checkpoint' AND j.revision_id=s.revision_id AND j.completed_at IS NULL AND j.next_attempt_at>clock_timestamp()) ORDER BY LEAST(s.purge_at,a.purge_at),s.revision_id LIMIT batch_limit);GET DIAGNOSTICS n=ROW_COUNT;affected=affected+n;
  DELETE FROM public.partner_assignment_payloads WHERE assignment_id IN(SELECT id FROM public.partner_learning_assignments WHERE environment_id=expected_environment AND purge_at<=clock_timestamp() ORDER BY purge_at,id LIMIT batch_limit);GET DIAGNOSTICS n=ROW_COUNT;affected=affected+n;
  UPDATE public.partner_decision_payloads p SET purge_at=LEAST(p.purge_at,a.purge_at,s.purge_at) FROM public.partner_review_decisions d JOIN public.partner_learning_assignments a ON a.id=d.assignment_id LEFT JOIN public.partner_checkpoint_revision_states s ON s.revision_id=d.checkpoint_revision_id WHERE p.decision_id=d.id AND a.environment_id=expected_environment AND LEAST(a.purge_at,s.purge_at) IS NOT NULL AND d.id IN(SELECT d2.id FROM public.partner_review_decisions d2 JOIN public.partner_learning_assignments a2 ON a2.id=d2.assignment_id LEFT JOIN public.partner_checkpoint_revision_states s2 ON s2.revision_id=d2.checkpoint_revision_id JOIN public.partner_decision_payloads p2 ON p2.decision_id=d2.id WHERE a2.environment_id=expected_environment AND LEAST(a2.purge_at,s2.purge_at) IS NOT NULL AND (p2.purge_at IS NULL OR p2.purge_at>LEAST(a2.purge_at,s2.purge_at)) ORDER BY LEAST(a2.purge_at,s2.purge_at),d2.id LIMIT batch_limit);
  DELETE FROM public.partner_decision_payloads WHERE decision_id IN(SELECT p.decision_id FROM public.partner_decision_payloads p JOIN public.partner_review_decisions d ON d.id=p.decision_id WHERE d.environment_id=expected_environment AND p.purge_at<=clock_timestamp() ORDER BY p.purge_at,p.decision_id LIMIT batch_limit);
  PERFORM set_config('turas.partner_cleanup','',true);RETURN affected;END $$;
 REVOKE ALL ON FUNCTION turas_partner_purge_learning(text,integer) FROM PUBLIC;
 UPDATE turas_environment SET schema_version=51;
`);
exports.down=()=>{throw Error('Partner learning history requires forward recovery');};
