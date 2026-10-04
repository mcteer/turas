exports.up=pgm=>pgm.sql(`
 CREATE TABLE report_jobs(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),customer_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('draft','render','dispatch','reconcile','cleanup')),input jsonb NOT NULL,input_digest text NOT NULL CHECK(input_digest ~ '^[a-f0-9]{64}$'),
 owner_membership_id uuid NOT NULL,owner_decision_id uuid REFERENCES report_decisions(id),policy_revision_id uuid REFERENCES report_recipient_policies(id),revision_id uuid REFERENCES report_revisions(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','completed','failed','cancelled')),attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),
 lease_token uuid,lease_until timestamptz,deadline_at timestamptz,available_at timestamptz NOT NULL DEFAULT now(),failure_code text,output_digest text CHECK(output_digest ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
 FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(environment_id,workspace_id,kind,input_digest));
 CREATE FUNCTION turas_report_job_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'state'-'attempt_count'-'lease_token'-'lease_until'-'deadline_at'-'available_at'-'failure_code'-'output_digest') IS DISTINCT FROM (to_jsonb(OLD)-'state'-'attempt_count'-'lease_token'-'lease_until'-'deadline_at'-'available_at'-'failure_code'-'output_digest') OR NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'job input immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER report_job_identity BEFORE UPDATE OR DELETE ON report_jobs FOR EACH ROW EXECUTE FUNCTION turas_report_job_identity();
 CREATE INDEX report_jobs_due ON report_jobs(environment_id,kind,state,available_at,lease_until);
 CREATE TABLE report_worker_heartbeats(environment_id text NOT NULL REFERENCES turas_environment(environment_id),worker_id uuid NOT NULL,seen_at timestamptz NOT NULL,PRIMARY KEY(environment_id,worker_id));
 CREATE TABLE report_cleanup_jobs(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),customer_id uuid NOT NULL,
   revision_id uuid REFERENCES report_revisions(id),payload_kind text NOT NULL CHECK(payload_kind IN ('revision','mail','artifact','delivery','recipient','scratch','decision','audit_receipt','audit_delivery','audit_decision','audit_revision','calculation')),
 payload_id uuid NOT NULL,payload_digest text NOT NULL CHECK(payload_digest ~ '^[a-f0-9]{64}$'),cause_generation bigint NOT NULL CHECK(cause_generation>=1),cause_kind text NOT NULL,
 due_at timestamptz NOT NULL,lease_token uuid,lease_until timestamptz,state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','done','stale')),
 created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
 UNIQUE NULLS NOT DISTINCT(revision_id,payload_kind,payload_id,payload_digest,cause_generation,cause_kind));
 CREATE INDEX report_cleanup_due ON report_cleanup_jobs(environment_id,state,due_at,lease_until);
 CREATE TABLE report_store_objects(object_key uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),revision_id uuid NOT NULL REFERENCES report_revisions(id),
 content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),size_bytes bigint NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 state text NOT NULL CHECK(state IN ('staged','finalized','deleted')),created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL);
 CREATE FUNCTION turas_report_purge_revision(p_environment text,p_job uuid,p_lease uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE j report_cleanup_jobs%ROWTYPE;r report_revision_states%ROWTYPE;
 BEGIN
 SELECT * INTO j FROM report_cleanup_jobs WHERE id=p_job AND environment_id=p_environment AND state='leased' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 IF j.payload_kind='decision' THEN
  DELETE FROM report_decision_payloads p USING report_decisions d WHERE p.decision_id=j.payload_id AND d.id=p.decision_id AND d.environment_id=j.environment_id AND d.workspace_id=j.workspace_id AND d.customer_id=j.customer_id AND d.rationale_digest=j.payload_digest AND p.revision_id IS NOT DISTINCT FROM j.revision_id
   AND (p.expires_at<=now() OR EXISTS(SELECT 1 FROM report_revision_states s WHERE s.revision_id=j.revision_id AND s.visibility IN ('withheld','expired') AND s.generation=j.cause_generation));
  IF NOT FOUND THEN RETURN false;END IF;
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  END IF;
   IF j.payload_kind='delivery' THEN
   DELETE FROM report_delivery_payloads p USING report_deliveries d
    WHERE p.delivery_id=j.payload_id AND d.id=p.delivery_id AND d.environment_id=j.environment_id
    AND d.workspace_id=j.workspace_id AND d.customer_id=j.customer_id AND d.payload_digest=j.payload_digest AND p.expires_at<=now();
   IF NOT FOUND THEN RETURN false;END IF;
   UPDATE report_deliveries SET state=CASE WHEN first_dispatch_at IS NULL THEN 'expired' ELSE state END,next_attempt_at=NULL,version=version+1 WHERE id=j.payload_id;
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  ELSIF j.payload_kind='recipient' THEN
   DELETE FROM report_policy_recipients p USING report_recipient_policies policy
    WHERE p.id=j.payload_id AND policy.id=p.policy_revision_id AND policy.environment_id=j.environment_id
    AND policy.workspace_id=j.workspace_id AND policy.customer_id=j.customer_id AND p.recipient_digest=j.payload_digest AND p.expires_at<=now();
   IF NOT FOUND THEN RETURN false;END IF;
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  END IF;
  SELECT * INTO r FROM report_revision_states WHERE revision_id=j.revision_id FOR UPDATE;
 IF NOT FOUND OR r.generation<>j.cause_generation OR r.visibility NOT IN ('withheld','expired') THEN
 UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN false;END IF;
 IF j.payload_kind='revision' AND j.payload_id=j.revision_id AND EXISTS(SELECT 1 FROM report_revisions WHERE id=j.revision_id AND content_digest=j.payload_digest) THEN
 DELETE FROM report_revision_payloads WHERE revision_id=j.revision_id;
  ELSIF j.payload_kind='mail' AND j.payload_id=j.revision_id THEN
   DELETE FROM report_mail_payloads WHERE revision_id=j.revision_id AND content_digest=j.payload_digest;
   ELSIF j.payload_kind='calculation' AND j.payload_id=j.revision_id THEN
   PERFORM set_config('turas.report.calculation_job',j.id::text,true);
   PERFORM set_config('turas.report.calculation_lease',p_lease::text,true);
   DELETE FROM report_calculations c USING report_revisions v WHERE c.revision_id=j.revision_id
    AND c.input_digest=j.payload_digest AND v.id=c.revision_id AND v.environment_id=j.environment_id
    AND v.workspace_id=j.workspace_id AND v.customer_id=j.customer_id;
   PERFORM set_config('turas.report.calculation_job','',true);
   PERFORM set_config('turas.report.calculation_lease','',true);
 ELSE RETURN false;END IF;
 UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
 END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_revision(text,uuid,uuid) FROM PUBLIC;
  CREATE FUNCTION turas_report_calculation_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
  BEGIN
   IF TG_OP='DELETE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_revision(text,uuid,uuid)'::regprocedure))
    AND EXISTS(SELECT 1 FROM report_cleanup_jobs j JOIN report_revision_states s ON s.revision_id=j.revision_id
      JOIN report_revisions v ON v.id=j.revision_id
      WHERE j.id::text=current_setting('turas.report.calculation_job',true)
      AND j.lease_token::text=current_setting('turas.report.calculation_lease',true) AND j.state='leased' AND j.lease_until>now()
      AND j.payload_kind='calculation' AND j.payload_id=OLD.revision_id AND j.revision_id=OLD.revision_id
      AND j.payload_digest=OLD.input_digest AND j.cause_generation=s.generation AND s.visibility IN ('withheld','expired')
      AND j.environment_id=v.environment_id AND j.workspace_id=v.workspace_id AND j.customer_id=v.customer_id)
    THEN RETURN OLD;END IF;
   RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
  END $$;
  DROP TRIGGER report_calculations_immutable ON report_calculations;
  CREATE TRIGGER report_calculations_immutable BEFORE UPDATE OR DELETE ON report_calculations FOR EACH ROW EXECUTE FUNCTION turas_report_calculation_identity();
  CREATE FUNCTION turas_report_purge_receipt_audit(p_environment text,p_job uuid,p_lease uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE j report_cleanup_jobs%ROWTYPE;r report_command_receipts%ROWTYPE;
  BEGIN
   SELECT * INTO j FROM report_cleanup_jobs WHERE id=p_job AND environment_id=p_environment AND payload_kind='audit_receipt'
    AND cause_kind='audit_retention_v2' AND cause_generation=1 AND revision_id IS NULL
    AND state='leased' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
   IF NOT FOUND THEN RETURN false;END IF;
   SELECT * INTO r FROM report_command_receipts WHERE id=j.payload_id AND environment_id=j.environment_id
    AND workspace_id=j.workspace_id AND customer_id=j.customer_id AND input_digest=j.payload_digest
    AND created_at<=now()-interval '730 days' AND action<>'expired' FOR UPDATE;
   IF NOT FOUND THEN UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN false;END IF;
   PERFORM set_config('turas.report.audit_job',j.id::text,true);
   PERFORM set_config('turas.report.audit_lease',p_lease::text,true);
   UPDATE report_command_receipts SET action='expired',result_ids='{"expired":true}'::jsonb WHERE id=r.id;
   PERFORM set_config('turas.report.audit_job','',true);
   PERFORM set_config('turas.report.audit_lease','',true);
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_receipt_audit(text,uuid,uuid) FROM PUBLIC;
  CREATE FUNCTION turas_report_receipt_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
  BEGIN
   IF TG_OP='UPDATE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_receipt_audit(text,uuid,uuid)'::regprocedure))
    AND NEW.action='expired' AND NEW.result_ids='{"expired":true}'::jsonb
    AND (to_jsonb(NEW)-'action'-'result_ids')=(to_jsonb(OLD)-'action'-'result_ids')
    AND OLD.created_at<=now()-interval '730 days'
    AND EXISTS(SELECT 1 FROM report_cleanup_jobs j WHERE j.id::text=current_setting('turas.report.audit_job',true)
      AND j.lease_token::text=current_setting('turas.report.audit_lease',true) AND j.state='leased' AND j.lease_until>now()
      AND j.payload_kind='audit_receipt' AND j.cause_kind='audit_retention_v2' AND j.cause_generation=1 AND j.revision_id IS NULL
      AND j.payload_id=OLD.id AND j.payload_digest=OLD.input_digest AND j.environment_id=OLD.environment_id
      AND j.workspace_id=OLD.workspace_id AND j.customer_id=OLD.customer_id) THEN RETURN NEW;END IF;
   RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
  END $$;
  DROP TRIGGER report_command_receipts_immutable ON report_command_receipts;
  CREATE TRIGGER report_command_receipts_immutable BEFORE UPDATE OR DELETE ON report_command_receipts FOR EACH ROW EXECUTE FUNCTION turas_report_receipt_identity();
 ALTER TABLE report_deliveries ADD COLUMN audit_expired_at timestamptz;
 CREATE OR REPLACE FUNCTION turas_report_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' OR (to_jsonb(NEW)-'created_at'-'audit_expired_at'-'first_dispatch_at'-'state'-'lease_token'-'lease_until'-'attempt_count'-'next_attempt_at'-'provider_message_id'-'version'-'failure_code') IS DISTINCT FROM (to_jsonb(OLD)-'created_at'-'audit_expired_at'-'first_dispatch_at'-'state'-'lease_token'-'lease_until'-'attempt_count'-'next_attempt_at'-'provider_message_id'-'version'-'failure_code') OR (OLD.first_dispatch_at IS NOT NULL AND NEW.first_dispatch_at IS DISTINCT FROM OLD.first_dispatch_at) OR NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'delivery identity immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE FUNCTION turas_report_purge_delivery_audit(p_environment text,p_job uuid,p_lease uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 DECLARE j report_cleanup_jobs%ROWTYPE;d report_deliveries%ROWTYPE;
 BEGIN
  SELECT * INTO j FROM report_cleanup_jobs WHERE id=p_job AND environment_id=p_environment AND payload_kind='audit_delivery'
   AND cause_kind='audit_retention_v2' AND cause_generation=1 AND revision_id IS NULL
   AND state='leased' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false;END IF;
  SELECT * INTO d FROM report_deliveries WHERE id=j.payload_id AND environment_id=j.environment_id
   AND workspace_id=j.workspace_id AND customer_id=j.customer_id AND payload_digest=j.payload_digest
   AND created_at<=now()-interval '730 days' AND audit_expired_at IS NULL
   AND (lease_until IS NULL OR lease_until<=now()) FOR UPDATE;
  IF NOT FOUND THEN UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN false;END IF;
  PERFORM set_config('turas.report.delivery_audit_job',j.id::text,true);
  PERFORM set_config('turas.report.delivery_audit_lease',p_lease::text,true);
   UPDATE report_attempt_results SET response_class='expired',provider_message_id=NULL,settled_at=to_timestamp(0)
   WHERE attempt_id IN (SELECT id FROM report_delivery_attempts WHERE delivery_id=d.id);
   UPDATE report_delivery_events SET provider_event_id='expired:'||id,provider_message_id='expired:'||id,occurred_at=to_timestamp(0),verified_at=to_timestamp(0) WHERE delivery_id=d.id;
   UPDATE report_deliveries SET provider_message_id=NULL,failure_code=NULL,next_attempt_at=NULL,lease_token=NULL,lease_until=NULL,created_at=to_timestamp(0),audit_expired_at=now() WHERE id=d.id;
  PERFORM set_config('turas.report.delivery_audit_job','',true);
  PERFORM set_config('turas.report.delivery_audit_lease','',true);
  UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
 END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_delivery_audit(text,uuid,uuid) FROM PUBLIC;
  CREATE FUNCTION turas_report_purge_unmatched_event(p_environment text,p_event uuid,p_digest text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE e report_delivery_events%ROWTYPE;
  BEGIN
   SELECT * INTO e FROM report_delivery_events WHERE id=p_event AND environment_id=p_environment
    AND delivery_id IS NULL AND verified_at<=now()-interval '24 hours'
    AND encode(sha256(convert_to(provider_event_id,'UTF8')),'hex')=p_digest FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RETURN false;END IF;
   PERFORM set_config('turas.report.unmatched_event',e.id::text,true);
   DELETE FROM report_delivery_events WHERE id=e.id;
   PERFORM set_config('turas.report.unmatched_event','',true);
   RETURN true;
  END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_unmatched_event(text,uuid,text) FROM PUBLIC;
 CREATE FUNCTION turas_report_delivery_audit_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
 DECLARE delivery uuid;allowed boolean:=false;
  BEGIN
   IF TG_TABLE_NAME='report_delivery_events' AND TG_OP='DELETE' THEN
    IF current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_unmatched_event(text,uuid,text)'::regprocedure))
     AND OLD.id::text=current_setting('turas.report.unmatched_event',true)
     AND OLD.delivery_id IS NULL AND OLD.verified_at<=now()-interval '24 hours' THEN RETURN OLD;END IF;
   END IF;
   IF TG_OP='UPDATE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_delivery_audit(text,uuid,uuid)'::regprocedure)) THEN
   IF TG_TABLE_NAME='report_attempt_results' THEN
    SELECT delivery_id INTO delivery FROM report_delivery_attempts WHERE id=OLD.attempt_id;
     allowed:=NEW.response_class='expired' AND NEW.provider_message_id IS NULL AND NEW.settled_at=to_timestamp(0) AND (to_jsonb(NEW)-'response_class'-'provider_message_id'-'settled_at')=(to_jsonb(OLD)-'response_class'-'provider_message_id'-'settled_at');
   ELSIF TG_TABLE_NAME='report_delivery_events' THEN
    delivery:=OLD.delivery_id;
     allowed:=NEW.provider_event_id='expired:'||OLD.id AND NEW.provider_message_id='expired:'||OLD.id AND NEW.occurred_at=to_timestamp(0) AND NEW.verified_at=to_timestamp(0) AND (to_jsonb(NEW)-'provider_event_id'-'provider_message_id'-'occurred_at'-'verified_at')=(to_jsonb(OLD)-'provider_event_id'-'provider_message_id'-'occurred_at'-'verified_at');
   ELSIF TG_TABLE_NAME='report_deliveries' THEN
    delivery:=OLD.id;
     allowed:=NEW.audit_expired_at=now() AND OLD.audit_expired_at IS NULL AND NEW.created_at=to_timestamp(0) AND NEW.provider_message_id IS NULL AND NEW.failure_code IS NULL
     AND NEW.next_attempt_at IS NULL AND NEW.lease_token IS NULL AND NEW.lease_until IS NULL
      AND (to_jsonb(NEW)-'created_at'-'audit_expired_at'-'provider_message_id'-'failure_code'-'next_attempt_at'-'lease_token'-'lease_until')=(to_jsonb(OLD)-'created_at'-'audit_expired_at'-'provider_message_id'-'failure_code'-'next_attempt_at'-'lease_token'-'lease_until');
   END IF;
   IF allowed AND EXISTS(SELECT 1 FROM report_cleanup_jobs j JOIN report_deliveries d ON d.id=j.payload_id
    WHERE j.id::text=current_setting('turas.report.delivery_audit_job',true) AND j.lease_token::text=current_setting('turas.report.delivery_audit_lease',true)
    AND j.state='leased' AND j.lease_until>now() AND j.payload_kind='audit_delivery' AND j.cause_kind='audit_retention_v2' AND j.cause_generation=1 AND j.revision_id IS NULL
    AND j.payload_id=delivery AND j.payload_digest=d.payload_digest AND j.environment_id=d.environment_id AND j.workspace_id=d.workspace_id AND j.customer_id=d.customer_id
    AND d.created_at<=now()-interval '730 days') THEN RETURN NEW;END IF;
  END IF;
   IF TG_TABLE_NAME='report_deliveries' AND TG_OP='UPDATE' AND NEW.audit_expired_at IS NOT DISTINCT FROM OLD.audit_expired_at THEN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'delivery identity immutable' USING ERRCODE='23514';END IF;
   IF OLD.audit_expired_at IS NOT NULL AND (NEW.provider_message_id IS NOT NULL OR NEW.failure_code IS NOT NULL OR NEW.next_attempt_at IS NOT NULL) THEN
    RAISE EXCEPTION 'expired delivery diagnostics cannot be restored' USING ERRCODE='23514';END IF;
   RETURN NEW;
  END IF;
  RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
 END $$;
 DROP TRIGGER report_attempt_results_immutable ON report_attempt_results;
 DROP TRIGGER report_delivery_events_immutable ON report_delivery_events;
 CREATE TRIGGER report_attempt_results_immutable BEFORE UPDATE OR DELETE ON report_attempt_results FOR EACH ROW EXECUTE FUNCTION turas_report_delivery_audit_identity();
 CREATE TRIGGER report_delivery_events_immutable BEFORE UPDATE OR DELETE ON report_delivery_events FOR EACH ROW EXECUTE FUNCTION turas_report_delivery_audit_identity();
  CREATE TRIGGER report_delivery_audit_identity BEFORE UPDATE ON report_deliveries FOR EACH ROW EXECUTE FUNCTION turas_report_delivery_audit_identity();
  ALTER TABLE report_decisions ADD COLUMN audit_expired_at timestamptz;
  ALTER TABLE report_decisions ALTER COLUMN actor_membership_id DROP NOT NULL;
  CREATE FUNCTION turas_report_purge_decision_audit(p_environment text,p_job uuid,p_lease uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE j report_cleanup_jobs%ROWTYPE;d report_decisions%ROWTYPE;
  BEGIN
   SELECT * INTO j FROM report_cleanup_jobs WHERE id=p_job AND environment_id=p_environment
    AND payload_kind='audit_decision' AND cause_kind='audit_retention_v2' AND cause_generation=1 AND revision_id IS NULL
    AND state='leased' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
   IF NOT FOUND THEN RETURN false;END IF;
   SELECT * INTO d FROM report_decisions WHERE id=j.payload_id AND environment_id=j.environment_id
    AND workspace_id=j.workspace_id AND customer_id=j.customer_id AND rationale_digest=j.payload_digest
    AND created_at<=now()-interval '730 days' AND audit_expired_at IS NULL FOR UPDATE;
   IF NOT FOUND THEN UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN false;END IF;
   PERFORM set_config('turas.report.decision_audit_job',j.id::text,true);
   PERFORM set_config('turas.report.decision_audit_lease',p_lease::text,true);
   DELETE FROM report_decision_payloads WHERE decision_id=d.id;
   UPDATE report_decisions SET actor_membership_id=NULL,preview_digest=repeat('0',64),rationale_digest=repeat('0',64),created_at=to_timestamp(0),audit_expired_at=now() WHERE id=d.id;
   PERFORM set_config('turas.report.decision_audit_job','',true);
   PERFORM set_config('turas.report.decision_audit_lease','',true);
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_decision_audit(text,uuid,uuid) FROM PUBLIC;
  CREATE FUNCTION turas_report_decision_audit_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
  BEGIN
   IF TG_OP='UPDATE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_decision_audit(text,uuid,uuid)'::regprocedure))
    AND OLD.audit_expired_at IS NULL AND NEW.audit_expired_at=now() AND NEW.actor_membership_id IS NULL
    AND NEW.preview_digest=repeat('0',64) AND NEW.rationale_digest=repeat('0',64) AND NEW.created_at=to_timestamp(0)
    AND (to_jsonb(NEW)-'actor_membership_id'-'preview_digest'-'rationale_digest'-'created_at'-'audit_expired_at')=(to_jsonb(OLD)-'actor_membership_id'-'preview_digest'-'rationale_digest'-'created_at'-'audit_expired_at')
    AND OLD.created_at<=now()-interval '730 days'
    AND EXISTS(SELECT 1 FROM report_cleanup_jobs j WHERE j.id::text=current_setting('turas.report.decision_audit_job',true)
      AND j.lease_token::text=current_setting('turas.report.decision_audit_lease',true) AND j.state='leased' AND j.lease_until>now()
      AND j.payload_kind='audit_decision' AND j.cause_kind='audit_retention_v2' AND j.cause_generation=1 AND j.revision_id IS NULL
      AND j.payload_id=OLD.id AND j.payload_digest=OLD.rationale_digest AND j.environment_id=OLD.environment_id
      AND j.workspace_id=OLD.workspace_id AND j.customer_id=OLD.customer_id) THEN RETURN NEW;END IF;
   RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
  END $$;
  DROP TRIGGER report_decisions_immutable ON report_decisions;
  CREATE TRIGGER report_decisions_immutable BEFORE UPDATE OR DELETE ON report_decisions FOR EACH ROW EXECUTE FUNCTION turas_report_decision_audit_identity();
  ALTER TABLE report_revisions ADD COLUMN audit_expired_at timestamptz;
  ALTER TABLE report_revisions ALTER COLUMN author_membership_id DROP NOT NULL;
  CREATE FUNCTION turas_report_purge_revision_audit(p_environment text,p_job uuid,p_lease uuid) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE j report_cleanup_jobs%ROWTYPE;r report_revisions%ROWTYPE;
  BEGIN
   SELECT * INTO j FROM report_cleanup_jobs WHERE id=p_job AND environment_id=p_environment AND payload_kind='audit_revision'
    AND payload_id=revision_id AND cause_kind='audit_retention_v2' AND state='leased' AND lease_token=p_lease AND lease_until>now() FOR UPDATE;
   IF NOT FOUND THEN RETURN false;END IF;
   SELECT v.* INTO r FROM report_revisions v JOIN report_revision_states s ON s.revision_id=v.id
    WHERE v.id=j.payload_id AND v.environment_id=j.environment_id AND v.workspace_id=j.workspace_id AND v.customer_id=j.customer_id
    AND v.content_digest=j.payload_digest AND v.created_at<=now()-interval '730 days' AND v.audit_expired_at IS NULL
    AND s.visibility IN ('expired','withheld') AND s.payload_expires_at<=now() AND s.generation=j.cause_generation
    AND NOT EXISTS(SELECT 1 FROM report_revision_payloads WHERE revision_id=v.id)
    AND NOT EXISTS(SELECT 1 FROM report_mail_payloads WHERE revision_id=v.id)
    AND NOT EXISTS(SELECT 1 FROM report_calculations WHERE revision_id=v.id)
    AND NOT EXISTS(SELECT 1 FROM report_store_objects WHERE revision_id=v.id AND state<>'deleted') FOR UPDATE OF v,s;
   IF NOT FOUND THEN UPDATE report_cleanup_jobs SET state='stale',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN false;END IF;
   PERFORM set_config('turas.report.revision_audit_job',j.id::text,true);
   PERFORM set_config('turas.report.revision_audit_lease',p_lease::text,true);
   UPDATE report_revisions SET author_membership_id=NULL,generation_watches='[]',created_at=to_timestamp(0),audit_expired_at=now() WHERE id=r.id;
   PERFORM set_config('turas.report.revision_audit_job','',true);
   PERFORM set_config('turas.report.revision_audit_lease','',true);
   UPDATE report_cleanup_jobs SET state='done',lease_token=NULL,lease_until=NULL WHERE id=j.id;RETURN true;
  END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_revision_audit(text,uuid,uuid) FROM PUBLIC;
  CREATE FUNCTION turas_report_revision_audit_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
  BEGIN
   IF TG_OP='UPDATE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_revision_audit(text,uuid,uuid)'::regprocedure))
    AND OLD.audit_expired_at IS NULL AND NEW.audit_expired_at=now() AND NEW.author_membership_id IS NULL AND NEW.generation_watches='[]'::jsonb AND NEW.created_at=to_timestamp(0)
    AND (to_jsonb(NEW)-'author_membership_id'-'generation_watches'-'created_at'-'audit_expired_at')=(to_jsonb(OLD)-'author_membership_id'-'generation_watches'-'created_at'-'audit_expired_at')
    AND OLD.created_at<=now()-interval '730 days'
    AND EXISTS(SELECT 1 FROM report_cleanup_jobs j JOIN report_revision_states s ON s.revision_id=j.revision_id
      WHERE j.id::text=current_setting('turas.report.revision_audit_job',true) AND j.lease_token::text=current_setting('turas.report.revision_audit_lease',true)
      AND j.state='leased' AND j.lease_until>now() AND j.payload_kind='audit_revision' AND j.cause_kind='audit_retention_v2'
      AND j.revision_id=OLD.id AND j.payload_id=OLD.id AND j.payload_digest=OLD.content_digest AND j.cause_generation=s.generation
      AND s.visibility IN ('expired','withheld') AND s.payload_expires_at<=now() AND j.environment_id=OLD.environment_id
      AND j.workspace_id=OLD.workspace_id AND j.customer_id=OLD.customer_id) THEN RETURN NEW;END IF;
   RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
  END $$;
  DROP TRIGGER report_revisions_immutable ON report_revisions;
  CREATE TRIGGER report_revisions_immutable BEFORE UPDATE OR DELETE ON report_revisions FOR EACH ROW EXECUTE FUNCTION turas_report_revision_audit_identity();
  CREATE FUNCTION turas_report_purge_preview(p_environment text,p_preview uuid,p_digest text) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  DECLARE p report_previews%ROWTYPE;
  BEGIN
   SELECT * INTO p FROM report_previews WHERE id=p_preview AND environment_id=p_environment AND binding_digest=p_digest AND expires_at<=now() FOR UPDATE SKIP LOCKED;
   IF NOT FOUND THEN RETURN false;END IF;
   PERFORM set_config('turas.report.expired_preview',p.id::text,true);
   DELETE FROM report_previews WHERE id=p.id;
   PERFORM set_config('turas.report.expired_preview','',true);
   RETURN true;
  END $$;
  REVOKE ALL ON FUNCTION turas_report_purge_preview(text,uuid,text) FROM PUBLIC;
  CREATE FUNCTION turas_report_preview_identity() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
  BEGIN
   IF TG_OP='DELETE' AND current_user=pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='turas_report_purge_preview(text,uuid,text)'::regprocedure))
    AND OLD.id::text=current_setting('turas.report.expired_preview',true) AND OLD.expires_at<=now() THEN RETURN OLD;END IF;
   RAISE EXCEPTION 'report identity is immutable' USING ERRCODE='23514';
  END $$;
  DROP TRIGGER report_previews_immutable ON report_previews;
  CREATE TRIGGER report_previews_immutable BEFORE UPDATE OR DELETE ON report_previews FOR EACH ROW EXECUTE FUNCTION turas_report_preview_identity();
`);
exports.down=()=>{throw new Error('Report migrations are forward-only');};
