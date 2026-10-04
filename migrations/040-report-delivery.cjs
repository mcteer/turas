exports.up=pgm=>{
 const scope=`id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),customer_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,environment_id,workspace_id,customer_id),FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id)`;
 const fk=(field,parent)=>`FOREIGN KEY(${field},environment_id,workspace_id,customer_id) REFERENCES ${parent}(id,environment_id,workspace_id,customer_id)`;
 const digest=name=>`${name} text NOT NULL CHECK(${name} ~ '^[a-f0-9]{64}$')`;
 pgm.sql(`
 CREATE TABLE report_publications(${scope},report_id uuid NOT NULL,revision_id uuid NOT NULL,publication_number bigint NOT NULL CHECK(publication_number>=1),decision_id uuid NOT NULL,
 correction_of uuid,artifact_digests jsonb NOT NULL,${digest('mail_digest')},audience text NOT NULL CHECK(audience IN ('delivery','account_team','leadership')),
 ${fk('report_id','report_scopes')},${fk('revision_id','report_revisions')},${fk('decision_id','report_decisions')},${fk('correction_of','report_publications')},
 FOREIGN KEY(revision_id,report_id) REFERENCES report_revisions(id,report_id),UNIQUE(report_id,publication_number),UNIQUE(revision_id));
 CREATE TABLE report_mail_payloads(revision_id uuid PRIMARY KEY REFERENCES report_revisions(id),html text NOT NULL CHECK(octet_length(html)<=262144),plain_text text NOT NULL CHECK(octet_length(plain_text)<=262144),${digest('content_digest')});
 CREATE TABLE report_senders(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 config_ref text NOT NULL,provider text NOT NULL CHECK(provider='resend'),${digest('config_digest')},verified boolean NOT NULL DEFAULT false,version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(id,environment_id,workspace_id));
 CREATE TABLE report_recipient_policies(${scope},policy_id uuid NOT NULL,version bigint NOT NULL CHECK(version>=1),selection jsonb NOT NULL,
 ${digest('scope_digest')},audience text NOT NULL CHECK(audience IN ('delivery','account_team','leadership')),sender_id uuid NOT NULL,${digest('recipient_set_digest')},
 owner_membership_id uuid NOT NULL,FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),
 FOREIGN KEY(sender_id,environment_id,workspace_id) REFERENCES report_senders(id,environment_id,workspace_id),UNIQUE(policy_id,version),UNIQUE(id,policy_id));
 CREATE TABLE report_policy_heads(policy_id uuid PRIMARY KEY,current_revision_id uuid NOT NULL REFERENCES report_recipient_policies(id),
 state text NOT NULL CHECK(state IN ('draft','approved','paused','revoked')),version bigint NOT NULL DEFAULT 1 CHECK(version>=1),approval_decision_id uuid REFERENCES report_decisions(id),FOREIGN KEY(current_revision_id,policy_id) REFERENCES report_recipient_policies(id,policy_id));
 CREATE TABLE report_policy_recipients(id uuid PRIMARY KEY,policy_revision_id uuid NOT NULL REFERENCES report_recipient_policies(id),address text NOT NULL CHECK(length(address) BETWEEN 3 AND 254),
 recipient_identity uuid NOT NULL,${digest('recipient_digest')},hmac_key_id text NOT NULL,membership_id uuid REFERENCES memberships(id),entitlement_rationale text CHECK(length(entitlement_rationale) BETWEEN 1 AND 500),
 expires_at timestamptz NOT NULL,UNIQUE(policy_revision_id,address),CHECK((membership_id IS NOT NULL)<>(entitlement_rationale IS NOT NULL)));
 CREATE TABLE report_recipient_keys(environment_id text NOT NULL REFERENCES turas_environment(environment_id),hmac_key_id text NOT NULL,${digest('key_digest')},created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(environment_id,hmac_key_id));
 CREATE TABLE report_recipient_identities(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 ${digest('recipient_digest')},hmac_key_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(environment_id,workspace_id,hmac_key_id,recipient_digest),FOREIGN KEY(environment_id,hmac_key_id) REFERENCES report_recipient_keys(environment_id,hmac_key_id));
 ALTER TABLE report_policy_recipients ADD FOREIGN KEY(recipient_identity) REFERENCES report_recipient_identities(id);
 CREATE TABLE report_schedules(${scope},policy_revision_id uuid NOT NULL,timezone text NOT NULL,local_time text NOT NULL CHECK(local_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
 owner_decision_id uuid NOT NULL,state text NOT NULL CHECK(state IN ('active','paused','revoked')),scope_digest text NOT NULL,audience text NOT NULL,
 next_run_at timestamptz NOT NULL,last_period date,version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
 ${fk('policy_revision_id','report_recipient_policies')},${fk('owner_decision_id','report_decisions')});
 CREATE UNIQUE INDEX report_schedule_active_scope ON report_schedules(environment_id,workspace_id,customer_id,scope_digest,audience,timezone) WHERE state='active';
 CREATE TABLE report_schedule_periods(schedule_id uuid NOT NULL REFERENCES report_schedules(id),from_date date NOT NULL,state text NOT NULL CHECK(state IN ('queued','missed','completed')),job_id uuid,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(schedule_id,from_date));
 CREATE TABLE report_deliveries(${scope},publication_id uuid NOT NULL,policy_revision_id uuid NOT NULL,recipient_identity uuid NOT NULL REFERENCES report_recipient_identities(id),
 sender_id uuid NOT NULL,sender_version bigint NOT NULL CHECK(sender_version>=1),${digest('sender_config_digest')},authorized_policy_version bigint NOT NULL CHECK(authorized_policy_version>=1),authority_decision_id uuid NOT NULL,${digest('payload_digest')},provider_key uuid NOT NULL UNIQUE,
 first_dispatch_at timestamptz,state text NOT NULL CHECK(state IN ('authorized','queued','dispatching','provider_accepted','delivered','blocked','cancelled','expired','retryable_failure','permanent_failure','uncertain','bounced','complained')),
 lease_token uuid,lease_until timestamptz,attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 3),next_attempt_at timestamptz,
 provider_message_id text,version bigint NOT NULL DEFAULT 1 CHECK(version>=1),failure_code text,
 ${fk('publication_id','report_publications')},${fk('policy_revision_id','report_recipient_policies')},${fk('authority_decision_id','report_decisions')},
 FOREIGN KEY(sender_id,environment_id,workspace_id) REFERENCES report_senders(id,environment_id,workspace_id),UNIQUE(publication_id,recipient_identity));
 CREATE TABLE report_delivery_payloads(delivery_id uuid PRIMARY KEY REFERENCES report_deliveries(id),request_bytes bytea NOT NULL CHECK(octet_length(request_bytes)<=23068672),expires_at timestamptz NOT NULL);
 CREATE TABLE report_delivery_attempts(${scope},delivery_id uuid NOT NULL,attempt_number integer NOT NULL CHECK(attempt_number BETWEEN 1 AND 3),lease_token uuid NOT NULL,
 ${digest('request_digest')},dispatch_at timestamptz NOT NULL,${fk('delivery_id','report_deliveries')},UNIQUE(delivery_id,attempt_number));
 CREATE TABLE report_attempt_results(attempt_id uuid PRIMARY KEY REFERENCES report_delivery_attempts(id),response_class text NOT NULL,provider_message_id text,settled_at timestamptz NOT NULL DEFAULT now());
 CREATE TABLE report_delivery_events(id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),provider_event_id text NOT NULL,provider_message_id text NOT NULL,
 delivery_id uuid REFERENCES report_deliveries(id),event_type text NOT NULL CHECK(event_type IN ('accepted','delivered','bounced','complained','failed')),
 occurred_at timestamptz NOT NULL,verified_at timestamptz NOT NULL DEFAULT now(),UNIQUE(environment_id,provider_event_id));
 CREATE TABLE report_recipient_suppressions(recipient_identity uuid PRIMARY KEY REFERENCES report_recipient_identities(id),event_id uuid NOT NULL REFERENCES report_delivery_events(id),resolved_by_decision_id uuid REFERENCES report_decisions(id));
 CREATE FUNCTION turas_report_delivery_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'first_dispatch_at'-'state'-'lease_token'-'lease_until'-'attempt_count'-'next_attempt_at'-'provider_message_id'-'version'-'failure_code') IS DISTINCT FROM (to_jsonb(OLD)-'first_dispatch_at'-'state'-'lease_token'-'lease_until'-'attempt_count'-'next_attempt_at'-'provider_message_id'-'version'-'failure_code') OR (OLD.first_dispatch_at IS NOT NULL AND NEW.first_dispatch_at IS DISTINCT FROM OLD.first_dispatch_at) OR NEW.attempt_count<OLD.attempt_count THEN RAISE EXCEPTION 'delivery identity immutable' USING ERRCODE='23514';END IF;RETURN NEW;END $$;
 CREATE TRIGGER report_delivery_identity BEFORE UPDATE OR DELETE ON report_deliveries FOR EACH ROW EXECUTE FUNCTION turas_report_delivery_identity();
 CREATE INDEX report_outbox_due ON report_deliveries(environment_id,state,next_attempt_at,lease_until);
 CREATE INDEX report_event_message ON report_delivery_events(environment_id,provider_message_id,occurred_at);
 `);
 for(const table of ['report_publications','report_recipient_policies','report_recipient_keys','report_recipient_identities','report_delivery_attempts','report_attempt_results','report_delivery_events'])pgm.sql(`CREATE TRIGGER ${table}_immutable BEFORE UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION turas_report_immutable();`);
 for(const table of ['report_mail_payloads','report_policy_recipients','report_delivery_payloads'])pgm.sql(`CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION turas_report_immutable();`);
};
exports.down=()=>{throw new Error('Report migrations are forward-only');};
