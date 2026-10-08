exports.up = pgm => {
  pgm.sql(`
    CREATE UNIQUE INDEX expansion_member_workspace_identity ON memberships(id,workspace_id);
    CREATE UNIQUE INDEX expansion_customer_workspace_identity ON customer_references(id,workspace_id);
    CREATE UNIQUE INDEX expansion_workload_scope_identity ON customer_workloads(id,workspace_id,customer_id);
    CREATE TABLE expansion_account_owners (
      customer_id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),
      workspace_id uuid NOT NULL, owner_membership_id uuid, version bigint NOT NULL DEFAULT 0 CHECK(version>=0 AND version<=9007199254740991),
      generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0 AND generation<=9007199254740991), updated_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(owner_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE expansion_owner_events (
      id uuid PRIMARY KEY, customer_id uuid NOT NULL REFERENCES expansion_account_owners(customer_id),
      actor_membership_id uuid NOT NULL REFERENCES memberships(id), previous_membership_id uuid REFERENCES memberships(id),
      next_membership_id uuid REFERENCES memberships(id), assignment_version bigint NOT NULL CHECK(assignment_version>=0 AND assignment_version<=9007199254740991),
      rationale_digest text NOT NULL CHECK(rationale_digest ~ '^[a-f0-9]{64}$'),created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE expansion_scopes (
      id uuid PRIMARY KEY, environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,workload_id uuid,generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0 AND generation<=9007199254740991),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(workload_id,workspace_id,customer_id) REFERENCES customer_workloads(id,workspace_id,customer_id),
      UNIQUE NULLS NOT DISTINCT(environment_id,workspace_id,customer_id,workload_id),
      UNIQUE(id,environment_id,workspace_id,customer_id)
    );
    CREATE TABLE expansion_hypotheses (
      id uuid PRIMARY KEY,scope_id uuid NOT NULL REFERENCES expansion_scopes(id),environment_id text NOT NULL,
      workspace_id uuid NOT NULL,customer_id uuid NOT NULL,creator_membership_id uuid NOT NULL,
      product_key text NOT NULL CHECK(product_key ~ '^[a-z0-9][a-z0-9._-]{0,79}$'),
      duplicate_key text NOT NULL CHECK(duplicate_key ~ '^[a-f0-9]{64}$'),
      working_revision_id uuid,decided_revision_id uuid,last_decision_id uuid,
      disposition text NOT NULL DEFAULT 'proposed' CHECK(disposition IN('proposed','qualified','deferred','dismissed')),
      version bigint NOT NULL DEFAULT 0 CHECK(version>=0 AND version<=9007199254740991),created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(scope_id,environment_id,workspace_id,customer_id) REFERENCES expansion_scopes(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(creator_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(id,scope_id),UNIQUE(id,environment_id,workspace_id,customer_id)
    );
    CREATE INDEX expansion_related_idx ON expansion_hypotheses(scope_id,duplicate_key,created_at,id);
    CREATE INDEX expansion_scope_list_idx ON expansion_hypotheses(scope_id,disposition,created_at,id);
    CREATE TABLE expansion_revisions (
      id uuid PRIMARY KEY,record_id uuid NOT NULL,scope_id uuid NOT NULL,revision_number bigint NOT NULL CHECK(revision_number>0 AND revision_number<=9007199254740991),
      author_membership_id uuid NOT NULL REFERENCES memberships(id),content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),
      source_digest text NOT NULL CHECK(source_digest ~ '^[a-f0-9]{64}$'),vocabulary_version text NOT NULL,
      ranking_version text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(record_id,scope_id) REFERENCES expansion_hypotheses(id,scope_id),UNIQUE(record_id,revision_number),UNIQUE(id,record_id)
    );
    CREATE TABLE expansion_decisions (
      id uuid PRIMARY KEY,record_id uuid NOT NULL,revision_id uuid NOT NULL,
      reviewer_membership_id uuid NOT NULL REFERENCES memberships(id),assignment_version bigint NOT NULL CHECK(assignment_version>=0 AND assignment_version<=9007199254740991),
      action text NOT NULL CHECK(action IN('qualify','defer','dismiss','reopen')),rationale_digest text NOT NULL CHECK(rationale_digest ~ '^[a-f0-9]{64}$'),
      preview_digest text NOT NULL CHECK(preview_digest ~ '^[a-f0-9]{64}$'),revisit_date date,
      CHECK((action='defer')=(revisit_date IS NOT NULL)),created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(revision_id,record_id) REFERENCES expansion_revisions(id,record_id),UNIQUE(id,record_id)
    );
    ALTER TABLE expansion_hypotheses ADD FOREIGN KEY(working_revision_id,id) REFERENCES expansion_revisions(id,record_id);
    ALTER TABLE expansion_hypotheses ADD FOREIGN KEY(decided_revision_id,id) REFERENCES expansion_revisions(id,record_id);
    ALTER TABLE expansion_hypotheses ADD FOREIGN KEY(last_decision_id,id) REFERENCES expansion_decisions(id,record_id);
    CREATE TABLE expansion_review_previews (
      digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
      environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,actor_membership_id uuid NOT NULL REFERENCES memberships(id),
      record_id uuid NOT NULL REFERENCES expansion_hypotheses(id),revision_id uuid NOT NULL,
      kind text NOT NULL CHECK(kind IN('full','metadata')),state_digest text NOT NULL CHECK(state_digest ~ '^[a-f0-9]{64}$'),
      expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(revision_id,record_id) REFERENCES expansion_revisions(id,record_id),
      FOREIGN KEY(record_id,environment_id,workspace_id,customer_id) REFERENCES expansion_hypotheses(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id)
    );
    CREATE TABLE expansion_payloads (
      id uuid PRIMARY KEY,revision_id uuid UNIQUE REFERENCES expansion_revisions(id),decision_id uuid UNIQUE REFERENCES expansion_decisions(id),
      owner_event_id uuid UNIQUE REFERENCES expansion_owner_events(id),content jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),invalidate_at timestamptz,purge_at timestamptz,
      CHECK(num_nonnulls(revision_id,decision_id,owner_event_id)=1)
    );
    CREATE TABLE expansion_dependencies (
      id uuid PRIMARY KEY,revision_id uuid NOT NULL REFERENCES expansion_revisions(id),source_kind text NOT NULL CHECK(source_kind IN('accepted_profile','approved_excerpt','verified_research','shared_knowledge','execution_record','milestone_baseline')),
      source_revision_id uuid NOT NULL,generation bigint NOT NULL CHECK(generation>0 AND generation<=9007199254740991),
      content_digest text NOT NULL CHECK(content_digest ~ '^[a-f0-9]{64}$'),UNIQUE(revision_id,source_kind,source_revision_id)
    );
    CREATE INDEX expansion_dependency_reverse_idx ON expansion_dependencies(source_kind,source_revision_id,revision_id);
    CREATE TABLE expansion_command_receipts (
      id uuid PRIMARY KEY,environment_id text NOT NULL REFERENCES turas_environment(environment_id),workspace_id uuid NOT NULL,
      customer_id uuid NOT NULL,actor_membership_id uuid NOT NULL,request_key uuid NOT NULL,
      request_digest text NOT NULL CHECK(request_digest ~ '^[a-f0-9]{64}$'),operation text NOT NULL CHECK(operation IN('save_hypothesis','save_suggestion','decide_hypothesis','assign_owner')),
      record_id uuid REFERENCES expansion_hypotheses(id),revision_id uuid REFERENCES expansion_revisions(id),decision_id uuid REFERENCES expansion_decisions(id),
      outcome text NOT NULL CHECK(outcome IN('proposed','qualified','deferred','dismissed','assigned','unassigned')),version bigint NOT NULL CHECK(version>=0 AND version<=9007199254740991),created_at timestamptz NOT NULL DEFAULT now(),
      FOREIGN KEY(customer_id,workspace_id) REFERENCES customer_references(id,workspace_id),
      FOREIGN KEY(actor_membership_id,workspace_id) REFERENCES memberships(id,workspace_id),UNIQUE(environment_id,workspace_id,actor_membership_id,request_key),
      FOREIGN KEY(record_id,environment_id,workspace_id,customer_id) REFERENCES expansion_hypotheses(id,environment_id,workspace_id,customer_id),
      FOREIGN KEY(revision_id,record_id) REFERENCES expansion_revisions(id,record_id),
      FOREIGN KEY(decision_id,record_id) REFERENCES expansion_decisions(id,record_id),
      CHECK((revision_id IS NULL AND decision_id IS NULL) OR record_id IS NOT NULL)
    );
    CREATE TABLE expansion_expired_command_keys(key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'));
    CREATE TABLE expansion_cleanup_jobs (
      id uuid PRIMARY KEY,payload_id uuid NOT NULL UNIQUE REFERENCES expansion_payloads(id),deadline timestamptz NOT NULL,
      lease_id uuid,lease_until timestamptz,state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','completed')),
      CHECK(state<>'leased' OR (lease_id IS NOT NULL AND lease_until IS NOT NULL))
    );
    CREATE TRIGGER expansion_revision_immutable BEFORE UPDATE OR DELETE ON expansion_revisions FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER expansion_decision_immutable BEFORE UPDATE OR DELETE ON expansion_decisions FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER expansion_owner_event_immutable BEFORE UPDATE OR DELETE ON expansion_owner_events FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE TRIGGER expansion_dependency_immutable BEFORE UPDATE OR DELETE ON expansion_dependencies FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE FUNCTION turas_expansion_identity_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF TG_TABLE_NAME='expansion_scopes' THEN
        IF ROW(NEW.id,NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.workload_id)
          IS DISTINCT FROM ROW(OLD.id,OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.workload_id) THEN
          RAISE EXCEPTION 'Expansion identity is immutable' USING ERRCODE='23514';
        END IF;
      ELSIF TG_TABLE_NAME='expansion_hypotheses' THEN
        IF ROW(NEW.id,NEW.scope_id,NEW.environment_id,NEW.workspace_id,NEW.customer_id,NEW.creator_membership_id,NEW.product_key,NEW.duplicate_key,NEW.created_at)
          IS DISTINCT FROM ROW(OLD.id,OLD.scope_id,OLD.environment_id,OLD.workspace_id,OLD.customer_id,OLD.creator_membership_id,OLD.product_key,OLD.duplicate_key,OLD.created_at) THEN
          RAISE EXCEPTION 'Expansion identity is immutable' USING ERRCODE='23514';
        END IF;
      ELSIF TG_TABLE_NAME='expansion_account_owners' THEN
        IF ROW(NEW.customer_id,NEW.workspace_id,NEW.environment_id) IS DISTINCT FROM ROW(OLD.customer_id,OLD.workspace_id,OLD.environment_id) THEN
          RAISE EXCEPTION 'Expansion identity is immutable' USING ERRCODE='23514';
        END IF;
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER expansion_scope_identity BEFORE UPDATE ON expansion_scopes FOR EACH ROW EXECUTE FUNCTION turas_expansion_identity_guard();
    CREATE TRIGGER expansion_hypothesis_identity BEFORE UPDATE ON expansion_hypotheses FOR EACH ROW EXECUTE FUNCTION turas_expansion_identity_guard();
    CREATE TRIGGER expansion_owner_identity BEFORE UPDATE ON expansion_account_owners FOR EACH ROW EXECUTE FUNCTION turas_expansion_identity_guard();
    CREATE FUNCTION turas_expansion_member_scope_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE scope_workspace uuid; member_ids uuid[];
    BEGIN
      IF TG_TABLE_NAME='expansion_owner_events' THEN
        SELECT workspace_id INTO scope_workspace FROM expansion_account_owners WHERE customer_id=NEW.customer_id;
        member_ids=ARRAY[NEW.actor_membership_id,NEW.previous_membership_id,NEW.next_membership_id];
      ELSIF TG_TABLE_NAME='expansion_revisions' THEN
        SELECT workspace_id INTO scope_workspace FROM expansion_scopes WHERE id=NEW.scope_id;
        member_ids=ARRAY[NEW.author_membership_id];
      ELSIF TG_TABLE_NAME='expansion_decisions' THEN
        SELECT workspace_id INTO scope_workspace FROM expansion_hypotheses WHERE id=NEW.record_id;
        member_ids=ARRAY[NEW.reviewer_membership_id];
      END IF;
      IF scope_workspace IS NULL OR EXISTS(SELECT 1 FROM unnest(member_ids) AS selected(id)
        WHERE selected.id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.id=selected.id AND m.workspace_id=scope_workspace)) THEN
        RAISE EXCEPTION 'Expansion membership scope mismatch' USING ERRCODE='23503';
      END IF;
      RETURN NEW;
    END; $$;
    CREATE TRIGGER expansion_owner_event_scope BEFORE INSERT ON expansion_owner_events FOR EACH ROW EXECUTE FUNCTION turas_expansion_member_scope_guard();
    CREATE TRIGGER expansion_revision_author_scope BEFORE INSERT ON expansion_revisions FOR EACH ROW EXECUTE FUNCTION turas_expansion_member_scope_guard();
    CREATE TRIGGER expansion_decision_reviewer_scope BEFORE INSERT ON expansion_decisions FOR EACH ROW EXECUTE FUNCTION turas_expansion_member_scope_guard();
    CREATE TABLE expansion_invalidations (
      revision_id uuid PRIMARY KEY REFERENCES expansion_revisions(id),invalidated_at timestamptz NOT NULL DEFAULT clock_timestamp()
    );
    CREATE TRIGGER expansion_invalidation_immutable BEFORE UPDATE OR DELETE ON expansion_invalidations FOR EACH ROW EXECUTE FUNCTION turas_profile_immutable();
    CREATE INDEX expansion_delivery_link_fanout_idx ON expansion_payloads USING gin((content->'deliveryLinks'));
    CREATE INDEX expansion_selected_engagement_fanout_idx ON expansion_payloads USING gin((content->'selectedEngagementIds'));
    CREATE INDEX expansion_payload_deadline_idx ON expansion_payloads(purge_at,id) WHERE purge_at IS NOT NULL;
    CREATE INDEX expansion_receipt_retention_idx ON expansion_command_receipts(environment_id,created_at,id);
    CREATE FUNCTION turas_expansion_invalidate_revision(expected_environment text,target_revision uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE event_at timestamptz;
    BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.expansion_revisions r JOIN public.expansion_hypotheses h ON h.id=r.record_id
        WHERE r.id=target_revision AND h.environment_id=expected_environment) THEN RETURN false; END IF;
      INSERT INTO public.expansion_invalidations(revision_id) VALUES(target_revision) ON CONFLICT DO NOTHING;
      SELECT invalidated_at INTO event_at FROM public.expansion_invalidations WHERE revision_id=target_revision;
      UPDATE public.expansion_payloads p SET invalidate_at=LEAST(COALESCE(p.invalidate_at,event_at),event_at),
        purge_at=LEAST(COALESCE(p.purge_at,event_at+interval '24 hours'),event_at+interval '24 hours')
        WHERE p.revision_id=target_revision OR p.decision_id IN(SELECT id FROM public.expansion_decisions WHERE revision_id=target_revision);
      INSERT INTO public.expansion_cleanup_jobs(id,payload_id,deadline)
        SELECT gen_random_uuid(),p.id,p.purge_at FROM public.expansion_payloads p
        WHERE p.revision_id=target_revision OR p.decision_id IN(SELECT id FROM public.expansion_decisions WHERE revision_id=target_revision)
        ON CONFLICT(payload_id) DO UPDATE SET deadline=LEAST(expansion_cleanup_jobs.deadline,excluded.deadline);
      RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_expansion_invalidate_revision(text,uuid) FROM PUBLIC;
    CREATE OR REPLACE FUNCTION turas_expansion_mark_invalid(expected_environment text,payload uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE revision uuid;
    BEGIN
      SELECT COALESCE(p.revision_id,d.revision_id) INTO revision FROM public.expansion_payloads p
        LEFT JOIN public.expansion_decisions d ON d.id=p.decision_id WHERE p.id=payload;
      IF revision IS NULL THEN RETURN false; END IF;
      RETURN public.turas_expansion_invalidate_revision(expected_environment,revision);
    END $$;
    REVOKE ALL ON FUNCTION turas_expansion_mark_invalid(text,uuid) FROM PUBLIC;
    CREATE OR REPLACE FUNCTION turas_expansion_purge(expected_environment text,payload uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE due_at timestamptz; actual_environment text;
    BEGIN
      SELECT p.purge_at,COALESCE(h.environment_id,owner.environment_id) INTO due_at,actual_environment
        FROM public.expansion_payloads p LEFT JOIN public.expansion_decisions d ON d.id=p.decision_id
        LEFT JOIN public.expansion_revisions r ON r.id=COALESCE(p.revision_id,d.revision_id)
        LEFT JOIN public.expansion_hypotheses h ON h.id=r.record_id
        LEFT JOIN public.expansion_owner_events e ON e.id=p.owner_event_id
        LEFT JOIN public.expansion_account_owners owner ON owner.customer_id=e.customer_id
        WHERE p.id=payload FOR UPDATE OF p;
      IF NOT FOUND OR actual_environment IS DISTINCT FROM expected_environment OR due_at IS NULL OR due_at>clock_timestamp() THEN RETURN false; END IF;
      DELETE FROM public.expansion_cleanup_jobs WHERE payload_id=payload;
      DELETE FROM public.expansion_payloads WHERE id=payload;
      RETURN FOUND;
    END $$;
    REVOKE ALL ON FUNCTION turas_expansion_purge(text,uuid) FROM PUBLIC;
    CREATE FUNCTION turas_expansion_schedule_retention(expected_environment text,batch_limit integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE scheduled integer;
    BEGIN
      IF batch_limit NOT BETWEEN 1 AND 500 OR NOT EXISTS(SELECT 1 FROM public.turas_environment WHERE environment_id=expected_environment) THEN RETURN 0; END IF;
      WITH expired AS (
        SELECT p.id,CASE WHEN EXISTS(SELECT 1 FROM public.expansion_decisions d WHERE d.revision_id=r.id)
          THEN r.created_at+interval '365 days' ELSE r.created_at+interval '90 days' END AS deadline
        FROM public.expansion_payloads p JOIN public.expansion_revisions r ON r.id=p.revision_id
        JOIN public.expansion_hypotheses h ON h.id=r.record_id WHERE h.environment_id=expected_environment
          AND r.id IS DISTINCT FROM h.working_revision_id AND r.id IS DISTINCT FROM h.decided_revision_id
          AND r.created_at<=clock_timestamp()-CASE WHEN EXISTS(SELECT 1 FROM public.expansion_decisions d WHERE d.revision_id=r.id)
            THEN interval '365 days' ELSE interval '90 days' END
        ORDER BY r.created_at,r.id LIMIT batch_limit
      ) UPDATE public.expansion_payloads p SET purge_at=LEAST(COALESCE(p.purge_at,expired.deadline),expired.deadline) FROM expired WHERE p.id=expired.id;
      INSERT INTO public.expansion_cleanup_jobs(id,payload_id,deadline)
        SELECT gen_random_uuid(),p.id,p.purge_at FROM public.expansion_payloads p
        LEFT JOIN public.expansion_decisions d ON d.id=p.decision_id
        LEFT JOIN public.expansion_revisions r ON r.id=COALESCE(p.revision_id,d.revision_id)
        LEFT JOIN public.expansion_hypotheses h ON h.id=r.record_id
        LEFT JOIN public.expansion_owner_events e ON e.id=p.owner_event_id
        LEFT JOIN public.expansion_account_owners owner ON owner.customer_id=e.customer_id
        WHERE COALESCE(h.environment_id,owner.environment_id)=expected_environment AND p.purge_at<=clock_timestamp()
        ORDER BY p.purge_at,p.id LIMIT batch_limit
        ON CONFLICT(payload_id) DO UPDATE SET deadline=LEAST(expansion_cleanup_jobs.deadline,excluded.deadline);
      GET DIAGNOSTICS scheduled=ROW_COUNT;
      DELETE FROM public.expansion_review_previews WHERE environment_id=expected_environment AND expires_at<=clock_timestamp();
      RETURN scheduled;
    END $$;
    REVOKE ALL ON FUNCTION turas_expansion_schedule_retention(text,integer) FROM PUBLIC;
    CREATE FUNCTION turas_expire_expansion_receipt(expected_environment text,receipt_id uuid,fences text[]) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
    DECLARE receipt public.expansion_command_receipts%ROWTYPE; identity text; fence text;
    BEGIN
      IF fences IS NULL OR cardinality(fences) NOT BETWEEN 1 AND 32 OR EXISTS(SELECT 1 FROM unnest(fences) h WHERE h IS NULL OR h !~ '^[a-f0-9]{64}$') THEN
        RAISE EXCEPTION 'Invalid receipt fence' USING ERRCODE='23514'; END IF;
      SELECT * INTO receipt FROM public.expansion_command_receipts WHERE id=receipt_id AND environment_id=expected_environment;
      IF NOT FOUND THEN RETURN false; END IF;
      identity:=format('[%s,%s,%s,%s]',to_json(receipt.environment_id)::text,to_json(receipt.workspace_id::text)::text,
        to_json(receipt.actor_membership_id::text)::text,to_json(receipt.request_key::text)::text);
      PERFORM pg_advisory_xact_lock(hashtextextended('expansion-command:' || encode(sha256(convert_to(identity,'UTF8')),'hex'),0));
      SELECT * INTO receipt FROM public.expansion_command_receipts WHERE id=receipt_id AND environment_id=expected_environment FOR UPDATE;
      IF NOT FOUND OR receipt.created_at>clock_timestamp()-interval '365 days' THEN RETURN false; END IF;
      FOREACH fence IN ARRAY fences LOOP INSERT INTO public.expansion_expired_command_keys(key_hash) VALUES(fence) ON CONFLICT DO NOTHING; END LOOP;
      DELETE FROM public.expansion_command_receipts WHERE id=receipt_id;RETURN true;
    END $$;
    REVOKE ALL ON FUNCTION turas_expire_expansion_receipt(text,uuid,text[]) FROM PUBLIC;
  `);
};
exports.down = () => { throw new Error('Expansion history requires forward recovery'); };
