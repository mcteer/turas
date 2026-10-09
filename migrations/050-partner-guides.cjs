exports.up = pgm => pgm.sql(`
 ALTER TABLE partner_organizations ADD COLUMN authority_revision bigint NOT NULL DEFAULT 1 CHECK(authority_revision BETWEEN 1 AND 9007199254740991);
 CREATE FUNCTION turas_partner_authority_epoch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_TABLE_NAME='partner_organizations' THEN
   NEW.authority_revision=GREATEST(NEW.authority_revision,OLD.authority_revision);
   IF NEW.active IS DISTINCT FROM OLD.active THEN NEW.authority_revision=GREATEST(NEW.authority_revision,OLD.authority_revision+1); END IF;
  ELSE
   NEW.revision=GREATEST(NEW.revision,OLD.revision);
   IF (NEW.active,NEW.kind,NEW.role,NEW.principal_id,NEW.workspace_id,NEW.partner_org_id) IS DISTINCT FROM
      (OLD.active,OLD.kind,OLD.role,OLD.principal_id,OLD.workspace_id,OLD.partner_org_id) THEN NEW.revision=GREATEST(NEW.revision,OLD.revision+1); END IF;
  END IF; RETURN NEW; END $$;
 CREATE TRIGGER partner_organization_epoch BEFORE UPDATE ON partner_organizations FOR EACH ROW EXECUTE FUNCTION turas_partner_authority_epoch();
 CREATE TRIGGER partner_membership_epoch BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION turas_partner_authority_epoch();
 CREATE TABLE partner_guides (
  id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id), workspace_id uuid NOT NULL,
  customer_id uuid NOT NULL,engagement_id uuid NOT NULL,plan_id uuid NOT NULL,workload_id uuid,
  creator_membership_id uuid NOT NULL,disposition text NOT NULL DEFAULT 'active' CHECK(disposition IN('active','retired')),
  version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),working_revision_id uuid,published_revision_id uuid,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
  FOREIGN KEY(engagement_id,environment_id,workspace_id,customer_id) REFERENCES engagements(id,environment_id,workspace_id,customer_id),
  FOREIGN KEY(plan_id,environment_id,workspace_id,customer_id) REFERENCES delivery_plans(id,environment_id,workspace_id,customer_id),
  FOREIGN KEY(workload_id,customer_id,workspace_id) REFERENCES customer_workloads(id,customer_id,workspace_id),
  FOREIGN KEY(creator_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,environment_id,workspace_id),UNIQUE(id,customer_id,workspace_id));
 CREATE INDEX partner_guide_discovery ON partner_guides(environment_id,workspace_id,customer_id,engagement_id,id);
 CREATE TABLE partner_guide_revisions (
  id uuid PRIMARY KEY,guide_id uuid NOT NULL REFERENCES partner_guides(id),revision_number bigint NOT NULL CHECK(revision_number>0),
  author_membership_id uuid NOT NULL REFERENCES memberships(id),accepted_plan_revision_id uuid NOT NULL REFERENCES plan_revisions(id),
  baseline_id uuid NOT NULL REFERENCES milestone_baselines(id),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
  source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),contract_version text NOT NULL DEFAULT 'partner-enablement-v1' CHECK(contract_version='partner-enablement-v1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(guide_id,revision_number),UNIQUE(id,guide_id),UNIQUE(id,guide_id,accepted_plan_revision_id,baseline_id));
 CREATE FUNCTION turas_partner_revision_scope() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM partner_guides g JOIN plan_revisions p ON p.id=NEW.accepted_plan_revision_id JOIN milestone_baselines b ON b.id=NEW.baseline_id JOIN memberships m ON m.id=NEW.author_membership_id WHERE g.id=NEW.guide_id AND p.plan_id=g.plan_id AND (p.environment_id,p.workspace_id,p.customer_id)=(g.environment_id,g.workspace_id,g.customer_id) AND (b.revision_id,b.engagement_id,b.plan_id,b.environment_id,b.workspace_id,b.customer_id)=(p.id,g.engagement_id,g.plan_id,g.environment_id,g.workspace_id,g.customer_id) AND m.workspace_id=g.workspace_id) THEN RAISE EXCEPTION 'Partner revision scope mismatch' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_revision_scope BEFORE INSERT ON partner_guide_revisions FOR EACH ROW EXECUTE FUNCTION turas_partner_revision_scope();
 ALTER TABLE partner_guides ADD FOREIGN KEY(working_revision_id,id) REFERENCES partner_guide_revisions(id,guide_id);
 ALTER TABLE partner_guides ADD FOREIGN KEY(published_revision_id,id) REFERENCES partner_guide_revisions(id,guide_id);
 CREATE TABLE partner_guide_payloads(revision_id uuid PRIMARY KEY REFERENCES partner_guide_revisions(id),content json NOT NULL CHECK(octet_length(content::text)<=131072));
 CREATE TABLE partner_guide_revision_states(revision_id uuid PRIMARY KEY REFERENCES partner_guide_revisions(id),review_state text NOT NULL DEFAULT 'draft' CHECK(review_state IN('draft','submitted','published','rejected')),
  generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),invalidated_at timestamptz,obsolete_at timestamptz,purge_at timestamptz,eligibility_recheck_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE INDEX partner_guide_purge_due ON partner_guide_revision_states(purge_at,revision_id) WHERE purge_at IS NOT NULL;
 CREATE INDEX partner_guide_recheck ON partner_guide_revision_states(eligibility_recheck_at,revision_id);
 CREATE TABLE partner_source_dependencies(id uuid PRIMARY KEY,guide_revision_id uuid REFERENCES partner_guide_revisions(id),checkpoint_revision_id uuid,
  source_kind text NOT NULL CHECK(source_kind IN('accepted_profile','approved_excerpt','verified_research','shared_knowledge','accepted_execution')),
  source_revision_id uuid NOT NULL,source_generation bigint NOT NULL CHECK(source_generation>0),source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),
  reference json,private_lineage boolean NOT NULL DEFAULT false,
  CHECK((guide_revision_id IS NOT NULL)::integer+(checkpoint_revision_id IS NOT NULL)::integer=1));
 CREATE INDEX partner_source_reverse ON partner_source_dependencies(source_kind,source_revision_id);
 CREATE INDEX partner_guide_sources ON partner_source_dependencies(guide_revision_id);
 CREATE TABLE partner_review_decisions(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
  guide_id uuid NOT NULL,guide_revision_id uuid NOT NULL,assignment_id uuid,checkpoint_revision_id uuid,
  action text NOT NULL CHECK(action IN('publish','reject','retire','assign','withdraw','replace','verify','request_changes')),
  reviewer_membership_id uuid,content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  self_review boolean NOT NULL,created_at timestamptz DEFAULT clock_timestamp(),minimized boolean NOT NULL DEFAULT false,
  FOREIGN KEY(guide_id,environment_id,workspace_id) REFERENCES partner_guides(id,environment_id,workspace_id),
  FOREIGN KEY(guide_revision_id,guide_id) REFERENCES partner_guide_revisions(id,guide_id),FOREIGN KEY(reviewer_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
 CREATE TABLE partner_decision_payloads(decision_id uuid PRIMARY KEY REFERENCES partner_review_decisions(id),content json NOT NULL CHECK(octet_length(content::text)<=16384),purge_at timestamptz);
 CREATE TABLE partner_commands(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_hash text NOT NULL CHECK(actor_hash ~ '^[a-f0-9]{64}$'),actor_membership_id uuid REFERENCES memberships(id),request_id uuid NOT NULL,
  action text NOT NULL CHECK(length(action)<=64),input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),customer_id uuid,
  target_id uuid,version bigint CHECK(version>0),outcome text NOT NULL CHECK(outcome IN('committed','abandoned','retired')),
  created_at timestamptz DEFAULT clock_timestamp(),retire_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '365 days',
  UNIQUE(environment_id,actor_hash,request_id),FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id));
 CREATE TABLE partner_review_previews(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
  actor_membership_id uuid NOT NULL,session_id uuid NOT NULL REFERENCES login_sessions(id),customer_id uuid NOT NULL,
  action text NOT NULL,input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),binding_digest text NOT NULL CHECK(binding_digest ~ '^[a-f0-9]{64}$'),
  binding json NOT NULL CHECK(octet_length(binding::text)<=163840),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '5 minutes',
  FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id));
 CREATE INDEX partner_preview_expiry ON partner_review_previews(expires_at);
 CREATE TABLE partner_list_cursors(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),actor_membership_id uuid NOT NULL REFERENCES memberships(id),session_id uuid NOT NULL REFERENCES login_sessions(id),
  scope_digest text NOT NULL CHECK(scope_digest ~ '^[a-f0-9]{64}$'),authority_digest text NOT NULL CHECK(authority_digest ~ '^[a-f0-9]{64}$'),sort_key json NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 minutes');
 CREATE INDEX partner_cursor_actor ON partner_list_cursors(actor_membership_id,created_at);
 CREATE TABLE partner_rate_windows(environment_id text NOT NULL REFERENCES turas_environment(environment_id),scope_key text NOT NULL,kind text NOT NULL CHECK(kind IN('read','write')),
  window_at timestamptz NOT NULL,count integer NOT NULL CHECK(count>0),PRIMARY KEY(environment_id,scope_key,kind,window_at));
 CREATE TABLE partner_cleanup_jobs(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),revision_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('guide','checkpoint')),
  reason text NOT NULL CHECK(reason IN('obsolete','source_unavailable','withdrawn','retired')),invalidated_at timestamptz NOT NULL,purge_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,
  UNIQUE(environment_id,kind,revision_id));
 CREATE INDEX partner_cleanup_due ON partner_cleanup_jobs(environment_id,next_attempt_at,purge_at,id) WHERE completed_at IS NULL;
 CREATE FUNCTION turas_partner_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF current_user=(SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid=TG_RELID) AND current_setting('turas.partner_cleanup',true)='yes' THEN RETURN COALESCE(NEW,OLD);END IF;
  RAISE EXCEPTION 'Partner history is append only' USING ERRCODE='23514';END $$;
 DO $$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['partner_guide_revisions','partner_guide_payloads','partner_source_dependencies','partner_review_decisions','partner_decision_payloads','partner_commands','partner_review_previews'] LOOP
  EXECUTE format('CREATE TRIGGER partner_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION turas_partner_immutable()',t);END LOOP;END $$;
 CREATE FUNCTION turas_partner_guide_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF (NEW.id,NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.engagement_id,NEW.plan_id,NEW.workload_id,NEW.creator_membership_id,NEW.created_at) IS DISTINCT FROM
     (OLD.id,OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.engagement_id,OLD.plan_id,OLD.workload_id,OLD.creator_membership_id,OLD.created_at)
     OR (OLD.disposition='retired' AND NEW.disposition<>'retired') THEN RAISE EXCEPTION 'Partner guide identity is immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_guide_identity BEFORE UPDATE ON partner_guides FOR EACH ROW EXECUTE FUNCTION turas_partner_guide_identity();
 CREATE FUNCTION turas_partner_earliest_deadline() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE field_name text;previous_at timestamptz;next_at timestamptz; BEGIN
  FOREACH field_name IN ARRAY ARRAY['invalidated_at','obsolete_at','purge_at'] LOOP
   previous_at=(to_jsonb(OLD)->>field_name)::timestamptz;next_at=(to_jsonb(NEW)->>field_name)::timestamptz;
   IF previous_at IS NOT NULL AND (next_at IS NULL OR next_at>previous_at) THEN RAISE EXCEPTION 'Partner retention deadlines cannot be extended' USING ERRCODE='23514';END IF;
  END LOOP;RETURN NEW;END $$;
 CREATE TRIGGER partner_earliest_deadline BEFORE UPDATE ON partner_guide_revision_states FOR EACH ROW EXECUTE FUNCTION turas_partner_earliest_deadline();
 CREATE TRIGGER partner_earliest_deadline BEFORE UPDATE ON partner_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION turas_partner_earliest_deadline();
 CREATE FUNCTION turas_partner_purge(expected_environment text,batch_limit integer) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE affected integer:=0;n integer; BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment AND schema_version>=50) OR batch_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid partner maintenance scope';END IF;
  PERFORM set_config('turas.partner_cleanup','yes',true);
  DELETE FROM public.partner_guide_payloads WHERE revision_id IN(SELECT s.revision_id FROM public.partner_guide_revision_states s JOIN public.partner_guide_revisions r ON r.id=s.revision_id JOIN public.partner_guides g ON g.id=r.guide_id WHERE g.environment_id=expected_environment AND s.purge_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM public.partner_cleanup_jobs j WHERE j.environment_id=expected_environment AND j.kind='guide' AND j.revision_id=s.revision_id AND j.completed_at IS NULL AND j.next_attempt_at>clock_timestamp()) ORDER BY s.purge_at,s.revision_id LIMIT batch_limit);
  GET DIAGNOSTICS n=ROW_COUNT;affected=affected+n;
  DELETE FROM public.partner_review_previews WHERE id IN(SELECT id FROM public.partner_review_previews WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  DELETE FROM public.partner_list_cursors WHERE id IN(SELECT id FROM public.partner_list_cursors WHERE environment_id=expected_environment AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT batch_limit);
  UPDATE public.partner_decision_payloads p SET purge_at=LEAST(p.purge_at,s.purge_at) FROM public.partner_review_decisions d JOIN public.partner_guide_revision_states s ON s.revision_id=d.guide_revision_id WHERE p.decision_id=d.id AND d.assignment_id IS NULL AND d.environment_id=expected_environment AND s.purge_at IS NOT NULL AND d.id IN(SELECT d2.id FROM public.partner_review_decisions d2 JOIN public.partner_guide_revision_states s2 ON s2.revision_id=d2.guide_revision_id JOIN public.partner_decision_payloads p2 ON p2.decision_id=d2.id WHERE d2.environment_id=expected_environment AND d2.assignment_id IS NULL AND s2.purge_at IS NOT NULL AND (p2.purge_at IS NULL OR p2.purge_at>s2.purge_at) ORDER BY s2.purge_at,d2.id LIMIT batch_limit);
  DELETE FROM public.partner_decision_payloads WHERE decision_id IN(SELECT id FROM public.partner_review_decisions WHERE environment_id=expected_environment AND (created_at<=clock_timestamp()-interval '365 days' OR id IN(SELECT decision_id FROM public.partner_decision_payloads WHERE purge_at<=clock_timestamp())) ORDER BY created_at,id LIMIT batch_limit);
  UPDATE public.partner_review_decisions SET reviewer_membership_id=NULL,created_at=NULL,minimized=true WHERE id IN(SELECT id FROM public.partner_review_decisions WHERE environment_id=expected_environment AND NOT minimized AND created_at<=clock_timestamp()-interval '365 days' ORDER BY created_at,id LIMIT batch_limit);
  UPDATE public.partner_commands SET outcome='retired',actor_membership_id=NULL,created_at=NULL,target_id=NULL,version=NULL WHERE id IN(SELECT id FROM public.partner_commands WHERE environment_id=expected_environment AND outcome<>'retired' AND retire_at<=clock_timestamp() ORDER BY retire_at,id LIMIT batch_limit);
  DELETE FROM public.partner_rate_windows WHERE ctid IN(SELECT ctid FROM public.partner_rate_windows WHERE environment_id=expected_environment AND window_at<clock_timestamp()-interval '2 minutes' ORDER BY window_at,scope_key LIMIT batch_limit);
  PERFORM set_config('turas.partner_cleanup','',true);RETURN affected;END $$;
 REVOKE ALL ON FUNCTION turas_partner_purge(text,integer) FROM PUBLIC;
 CREATE FUNCTION turas_partner_invalidate_source(source_type text,source_revision uuid,event_at timestamptz DEFAULT clock_timestamp()) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  UPDATE public.partner_guide_revision_states s SET invalidated_at=LEAST(s.invalidated_at,event_at),purge_at=LEAST(s.purge_at,event_at+interval '24 hours'),generation=s.generation+1 WHERE s.revision_id IN(SELECT guide_revision_id FROM public.partner_source_dependencies WHERE source_kind=source_type AND source_revision_id=source_revision);
  IF to_regclass('public.partner_checkpoint_revision_states') IS NOT NULL THEN EXECUTE 'UPDATE public.partner_checkpoint_revision_states s SET invalidated_at=LEAST(s.invalidated_at,$1),purge_at=LEAST(s.purge_at,$1+interval ''24 hours''),generation=s.generation+1 WHERE s.revision_id IN(SELECT checkpoint_revision_id FROM public.partner_source_dependencies WHERE source_kind=$2 AND source_revision_id=$3)' USING event_at,source_type,source_revision;END IF;
 END $$;
 REVOKE ALL ON FUNCTION turas_partner_invalidate_source(text,uuid,timestamptz) FROM PUBLIC;
 CREATE FUNCTION turas_partner_source_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF TG_TABLE_NAME='profile_records' THEN IF OLD.current_accepted_revision_id IS DISTINCT FROM NEW.current_accepted_revision_id THEN PERFORM public.turas_partner_invalidate_source('accepted_profile',OLD.current_accepted_revision_id);END IF;
  ELSIF TG_TABLE_NAME='evidence_source_events' THEN IF NEW.event_type IN('withdraw','supersede') THEN PERFORM public.turas_partner_invalidate_source('verified_research',NEW.source_revision_id,NEW.created_at);END IF;
  ELSIF TG_TABLE_NAME='knowledge_publications' THEN IF OLD.state IS DISTINCT FROM NEW.state THEN PERFORM public.turas_partner_invalidate_source('shared_knowledge',OLD.revision_id);END IF;
  ELSIF TG_TABLE_NAME='artifact_versions' THEN IF OLD.state IS DISTINCT FROM NEW.state OR OLD.lifecycle_generation IS DISTINCT FROM NEW.lifecycle_generation THEN PERFORM public.turas_partner_invalidate_source('approved_excerpt',s.id) FROM public.artifact_evidence_selections s WHERE s.version_id=NEW.id;END IF;
  ELSIF TG_TABLE_NAME='execution_records' THEN IF OLD.accepted_revision_id IS DISTINCT FROM NEW.accepted_revision_id THEN PERFORM public.turas_partner_invalidate_source('accepted_execution',OLD.accepted_revision_id);END IF;
  ELSIF TG_TABLE_NAME='engagements' THEN IF OLD.active_baseline_id IS DISTINCT FROM NEW.active_baseline_id THEN
   UPDATE public.partner_guide_revision_states s SET obsolete_at=COALESCE(s.obsolete_at,clock_timestamp()),purge_at=LEAST(s.purge_at,clock_timestamp()+interval '90 days') WHERE s.revision_id IN(SELECT r.id FROM public.partner_guide_revisions r JOIN public.partner_guides g ON g.id=r.guide_id WHERE g.engagement_id=NEW.id AND r.baseline_id=OLD.active_baseline_id);
   IF to_regclass('public.partner_learning_assignments') IS NOT NULL THEN EXECUTE 'UPDATE public.partner_learning_assignments SET obsolete_at=COALESCE(obsolete_at,clock_timestamp()),purge_at=LEAST(purge_at,clock_timestamp()+interval ''90 days'') WHERE baseline_id=$1' USING OLD.active_baseline_id;END IF;
  END IF;END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_profile_source_change AFTER UPDATE ON profile_records FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE TRIGGER partner_research_source_change AFTER INSERT ON evidence_source_events FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE TRIGGER partner_shared_source_change AFTER UPDATE ON knowledge_publications FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE TRIGGER partner_excerpt_source_change AFTER UPDATE ON artifact_versions FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE TRIGGER partner_execution_source_change AFTER UPDATE ON execution_records FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE TRIGGER partner_baseline_source_change AFTER UPDATE ON engagements FOR EACH ROW EXECUTE FUNCTION turas_partner_source_change();
 CREATE FUNCTION turas_partner_conflict_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN IF NEW.state='confirmed' THEN
  IF TG_TABLE_NAME='evidence_conflict_targets' THEN PERFORM public.turas_partner_invalidate_source(CASE WHEN NEW.first_kind='published_shared' THEN 'shared_knowledge' ELSE NEW.first_kind END,NEW.first_revision_id);PERFORM public.turas_partner_invalidate_source(CASE WHEN NEW.second_kind='published_shared' THEN 'shared_knowledge' ELSE NEW.second_kind END,NEW.second_revision_id);
  ELSE PERFORM public.turas_partner_invalidate_source('accepted_profile',NEW.first_revision_id);PERFORM public.turas_partner_invalidate_source('accepted_profile',NEW.second_revision_id);END IF;
 END IF;RETURN NEW;END $$;
 CREATE TRIGGER partner_typed_conflict_change AFTER INSERT OR UPDATE ON evidence_conflict_targets FOR EACH ROW EXECUTE FUNCTION turas_partner_conflict_change();
 CREATE TRIGGER partner_legacy_conflict_change AFTER INSERT OR UPDATE ON evidence_conflicts FOR EACH ROW EXECUTE FUNCTION turas_partner_conflict_change();
 -- Serialize private contributor changes with the public source header. Readers
 -- never acquire another workspace's authority rows after source/head locks.
 CREATE FUNCTION turas_partner_contributor_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ DECLARE affected uuid[];r uuid;BEGIN
  SELECT array_agg(p.revision_id ORDER BY p.revision_id) INTO affected FROM public.knowledge_publications p JOIN public.knowledge_contributions c ON c.id=p.contribution_id JOIN public.memberships m ON m.id=c.author_membership_id WHERE
   (TG_TABLE_NAME='memberships' AND m.id=NEW.id) OR (TG_TABLE_NAME='principals' AND m.principal_id=NEW.id) OR (TG_TABLE_NAME='workspaces' AND c.workspace_id=NEW.id) OR (TG_TABLE_NAME='partner_organizations' AND m.partner_org_id=NEW.id) OR (TG_TABLE_NAME='customer_grants' AND m.id=(to_jsonb(NEW)->>'membership_id')::uuid AND c.customer_id=(to_jsonb(NEW)->>'customer_id')::uuid);
  IF affected IS NULL THEN RETURN NEW;END IF;
  PERFORM 1 FROM public.knowledge_publications WHERE revision_id=ANY(affected) ORDER BY revision_id FOR UPDATE;
  FOREACH r IN ARRAY affected LOOP IF NOT EXISTS(SELECT 1 FROM public.knowledge_contributions c JOIN public.knowledge_publications kp ON kp.contribution_id=c.id JOIN public.memberships m ON m.id=c.author_membership_id JOIN public.principals p ON p.id=m.principal_id JOIN public.workspaces w ON w.id=m.workspace_id LEFT JOIN public.partner_organizations o ON o.id=m.partner_org_id LEFT JOIN public.customer_grants g ON g.membership_id=m.id AND g.customer_id=c.customer_id AND g.state='active' WHERE kp.revision_id=r AND m.active AND p.active AND w.active AND (m.kind='internal' OR o.active AND g.id IS NOT NULL)) THEN PERFORM public.turas_partner_invalidate_source('shared_knowledge',r);END IF;END LOOP;
  RETURN NEW;END $$;
 CREATE TRIGGER partner_contributor_member_change AFTER UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION turas_partner_contributor_change();
 CREATE TRIGGER partner_contributor_principal_change AFTER UPDATE ON principals FOR EACH ROW EXECUTE FUNCTION turas_partner_contributor_change();
 CREATE TRIGGER partner_contributor_workspace_change AFTER UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION turas_partner_contributor_change();
 CREATE TRIGGER partner_contributor_org_change AFTER UPDATE ON partner_organizations FOR EACH ROW EXECUTE FUNCTION turas_partner_contributor_change();
 CREATE TRIGGER partner_contributor_grant_change AFTER UPDATE ON customer_grants FOR EACH ROW EXECUTE FUNCTION turas_partner_contributor_change();

 UPDATE turas_environment SET schema_version=50;
`);
exports.down = () => { throw Error('Partner history requires forward recovery'); };
