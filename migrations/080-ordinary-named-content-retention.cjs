exports.up=pgm=>pgm.sql(`
 -- C05: retained source identifiers only; no fact, quote, URL or tool payload.
 CREATE TABLE ordinary_named_content_coverage(
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  coverage text NOT NULL CHECK(coverage IN('complete','legacy_gap')),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp());
 CREATE TABLE ordinary_named_content_dependencies(
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,customer_id uuid,citation_id text NOT NULL,
  first_attempt_id uuid NOT NULL,
  scope_key text GENERATED ALWAYS AS(COALESCE(customer_id::text,'workspace')) STORED,
  consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(conversation_id,scope_key,citation_id),
  CHECK(citation_id ~ '^(accepted_manual|attributed_research):[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    OR citation_id ~ '^public_practice:[a-f0-9]{64}$'));
 CREATE FUNCTION turas_named_content_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='DELETE' AND pg_trigger_depth()>1 AND NOT EXISTS(SELECT 1 FROM public.conversations WHERE id=OLD.conversation_id) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'Named content history is append-only' USING ERRCODE='23514';
 END $$;
 REVOKE ALL ON FUNCTION turas_named_content_append_only() FROM PUBLIC;
 CREATE TRIGGER named_content_append_only BEFORE UPDATE OR DELETE ON ordinary_named_content_dependencies
  FOR EACH ROW EXECUTE FUNCTION turas_named_content_append_only();
 CREATE TRIGGER named_coverage_append_only BEFORE UPDATE OR DELETE ON ordinary_named_content_coverage
  FOR EACH ROW EXECUTE FUNCTION turas_named_content_append_only();
 -- Absence of surviving active IDs does not prove complete pre080 consumption.
 INSERT INTO ordinary_named_content_coverage(conversation_id,coverage)
  SELECT c.id,'legacy_gap' FROM conversations c;
 CREATE FUNCTION turas_initialize_named_coverage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
  -- Native pg_dump restores define triggers in post-data. Owner work-copy
  -- restores into an existing schema must set this flag while loading data.
  IF current_setting('turas.restore_loading',true)='on' AND ((current_setting('role')='none' AND session_user=pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.ordinary_named_content_coverage'::regclass))) OR current_setting('role')=pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.ordinary_named_content_coverage'::regclass))) THEN RETURN NEW; END IF;
  INSERT INTO public.ordinary_named_content_coverage(conversation_id,coverage) VALUES(NEW.id,'complete') ON CONFLICT DO NOTHING;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_initialize_named_coverage() FROM PUBLIC;
 CREATE TRIGGER initialize_named_coverage AFTER INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION turas_initialize_named_coverage();
 -- Conservative bounded known-current subset, always legacy_gap.
 -- first_attempt_id is the earliest retained known attempt, not proven first use.
 WITH known AS(
  SELECT DISTINCT ON(authority.conversation_id,s.customer_id,citation) authority.conversation_id,s.customer_id,citation,s.attempt_id FROM general_customer_read_scopes s JOIN general_context_receipts authority ON authority.attempt_id=s.attempt_id CROSS JOIN LATERAL unnest(s.citation_ids) citation
  WHERE (citation ~ '^accepted_manual:[a-f0-9-]{36}$' AND EXISTS(SELECT 1 FROM profile_revisions v JOIN profile_records r ON r.current_accepted_revision_id=v.id WHERE v.id::text=substring(citation from 17) AND v.origin='manual' AND NOT EXISTS(SELECT 1 FROM profile_evidence_links support WHERE support.profile_revision_id=v.id) AND NOT EXISTS(SELECT 1 FROM evidence_conflicts conflict WHERE conflict.state='confirmed' AND(v.id=conflict.first_revision_id OR v.id=conflict.second_revision_id))))
   OR (citation ~ '^attributed_research:[a-f0-9-]{36}$' AND EXISTS(SELECT 1 FROM evidence_source_revisions v JOIN evidence_sources origin ON origin.id=v.source_id AND origin.origin='independent_research' JOIN research_checks checks ON checks.source_revision_id=v.id AND checks.identity_result AND checks.scope_result AND checks.integrity_result AND checks.content_result WHERE v.id::text=substring(citation from 21) AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id AND e.event_type IN('withdraw','supersede'))))
   OR (citation ~ '^public_practice:[a-f0-9]{64}$' AND EXISTS(SELECT 1 FROM general_context_receipts r JOIN turas_evidence_snapshots snapshot ON snapshot.environment_id=r.environment_id AND snapshot.workspace_id=r.workspace_id::text JOIN turas_vercel_practice_sources mapping ON mapping.environment_id=snapshot.environment_id AND mapping.workspace_id=snapshot.workspace_id AND mapping.snapshot_id=snapshot.id WHERE r.attempt_id=s.attempt_id AND snapshot.id=substring(citation from 17) AND mapping.source_type='vercel_documentation' AND snapshot.url LIKE 'https://vercel.com/docs/%' AND snapshot.url !~ '[?#]' AND NOT EXISTS(SELECT 1 FROM turas_evidence_snapshots newer WHERE newer.environment_id=snapshot.environment_id AND newer.workspace_id=snapshot.workspace_id AND newer.url=snapshot.url AND newer.checked_at>snapshot.checked_at AND newer.content_hash<>snapshot.content_hash) AND NOT EXISTS(SELECT 1 FROM evidence_sources canonical WHERE canonical.workspace_id=r.workspace_id AND canonical.customer_id=s.customer_id AND canonical.origin='independent_research' AND canonical.canonical_location=snapshot.url)))
  ORDER BY authority.conversation_id,s.customer_id,citation,authority.as_of,s.attempt_id
 ),bounded AS(SELECT known.*,row_number() OVER(PARTITION BY conversation_id ORDER BY customer_id,citation,attempt_id) AS ordinal FROM known)
 INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
  SELECT conversation_id,customer_id,citation,attempt_id FROM bounded WHERE ordinal<=1000 ON CONFLICT DO NOTHING;
 CREATE FUNCTION turas_capture_named_content() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 DECLARE conversation uuid;workspace uuid;environment text;ids text[];
 BEGIN
  IF current_setting('turas.restore_loading',true)='on' AND ((current_setting('role')='none' AND session_user=pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.ordinary_named_content_coverage'::regclass))) OR current_setting('role')=pg_get_userbyid((SELECT relowner FROM pg_catalog.pg_class WHERE oid='public.ordinary_named_content_coverage'::regclass))) THEN RETURN NEW; END IF;
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Named content appends require READ COMMITTED' USING ERRCODE='25001'; END IF;

  IF TG_OP='UPDATE' AND (NEW.attempt_id,NEW.customer_id) IS DISTINCT FROM(OLD.attempt_id,OLD.customer_id) THEN
   RAISE EXCEPTION 'Named read scope identity is immutable' USING ERRCODE='23514'; END IF;
  SELECT conversation_id,workspace_id,environment_id INTO STRICT conversation,workspace,environment FROM public.general_context_receipts WHERE attempt_id=NEW.attempt_id;
  IF NOT EXISTS(SELECT 1 FROM public.ordinary_named_content_coverage WHERE conversation_id=conversation AND coverage='complete') THEN
   RAISE EXCEPTION 'Named content coverage is unavailable' USING ERRCODE='55000'; END IF;
  ids:=NEW.citation_ids;
  IF TG_OP='UPDATE' THEN ids:=ids||OLD.citation_ids; END IF;
  WITH inserted AS(INSERT INTO public.ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
   SELECT conversation,NEW.customer_id,citation,NEW.attempt_id FROM unnest(ids) citation ON CONFLICT DO NOTHING RETURNING citation_id)
  INSERT INTO public.ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
   SELECT conversation,NEW.customer_id,'attributed_research:'||head.id::text,NEW.attempt_id FROM inserted dependency
   JOIN public.turas_evidence_snapshots snapshot ON dependency.citation_id='public_practice:'||snapshot.id AND snapshot.environment_id=environment AND snapshot.workspace_id=workspace::text
   JOIN public.evidence_sources canonical ON canonical.workspace_id=workspace AND canonical.customer_id=NEW.customer_id AND canonical.origin='independent_research' AND canonical.canonical_location=snapshot.url
   JOIN LATERAL(SELECT id FROM public.evidence_source_revisions revision WHERE revision.source_id=canonical.id ORDER BY version DESC LIMIT 1) head ON true
   ON CONFLICT DO NOTHING;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_capture_named_content() FROM PUBLIC;
 CREATE TRIGGER capture_named_content AFTER INSERT OR UPDATE OF citation_ids ON general_customer_read_scopes
  FOR EACH ROW EXECUTE FUNCTION turas_capture_named_content();
 CREATE FUNCTION turas_record_workspace_practice_content(attempt uuid,owner_principal uuid,login_session uuid,snapshots text[]) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 DECLARE conversation uuid;workspace uuid;environment text; BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Named content appends require READ COMMITTED' USING ERRCODE='25001'; END IF;

  IF snapshots IS NULL OR cardinality(snapshots) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(snapshots) id WHERE id IS NULL OR id !~ '^[a-f0-9]{64}$') THEN
   RAISE EXCEPTION 'Bounded public practice identifiers required' USING ERRCODE='23514'; END IF;
  SELECT authority.conversation_id,authority.workspace_id,authority.environment_id INTO conversation,workspace,environment
   FROM public.ordinary_chat_authorities authority JOIN public.general_context_receipts receipt ON receipt.attempt_id=authority.attempt_id
   JOIN public.conversations owned ON owned.id=authority.conversation_id AND owned.owner_principal_id=authority.owner_principal_id AND owned.workspace_id=authority.workspace_id AND owned.environment_id=authority.environment_id
   JOIN public.login_sessions session ON session.id=authority.login_session_id AND session.id=login_session AND session.principal_id=authority.owner_principal_id AND session.membership_id=authority.membership_id AND session.workspace_id=authority.workspace_id AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp()
   JOIN public.memberships membership ON membership.id=authority.membership_id AND membership.active
   JOIN public.principals principal ON principal.id=membership.principal_id AND principal.active
   JOIN public.workspaces active_workspace ON active_workspace.id=membership.workspace_id AND active_workspace.active
   LEFT JOIN public.partner_organizations org ON org.id=membership.partner_org_id
   WHERE authority.attempt_id=attempt AND authority.owner_principal_id=owner_principal AND authority.valid_until>clock_timestamp()
    AND(membership.kind='internal' OR org.active);
  IF conversation IS NULL OR NOT EXISTS(SELECT 1 FROM public.ordinary_named_content_coverage WHERE conversation_id=conversation AND coverage='complete')
   OR NOT EXISTS(SELECT 1 FROM public.operations_control WHERE environment_id=environment AND mode='open') THEN
   RAISE EXCEPTION 'Current public practice owner scope required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(snapshots) id WHERE NOT EXISTS(
   SELECT 1 FROM public.turas_evidence_snapshots snapshot JOIN public.turas_vercel_practice_sources mapping ON mapping.environment_id=snapshot.environment_id AND mapping.workspace_id=snapshot.workspace_id AND mapping.snapshot_id=snapshot.id
   WHERE snapshot.id=id AND snapshot.environment_id=environment AND snapshot.workspace_id=workspace::text AND mapping.source_type='vercel_documentation' AND snapshot.url LIKE 'https://vercel.com/docs/%' AND snapshot.url !~ '[?#]'
    AND NOT EXISTS(SELECT 1 FROM public.turas_evidence_snapshots newer WHERE newer.environment_id=snapshot.environment_id AND newer.workspace_id=snapshot.workspace_id AND newer.url=snapshot.url AND newer.checked_at>snapshot.checked_at AND newer.content_hash<>snapshot.content_hash))) THEN
   RAISE EXCEPTION 'Public practice source changed' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
   SELECT conversation,NULL,'public_practice:'||id,attempt FROM unnest(snapshots) id ON CONFLICT DO NOTHING;

 END $$;
 REVOKE ALL ON FUNCTION turas_record_workspace_practice_content(uuid,uuid,uuid,text[]) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION turas_record_workspace_practice_content(uuid,uuid,uuid,text[]) TO turas_runtime;
 -- Current canonical support is captured at actual practice consumption;
 -- later historical checks never substitute the future URL head.
 CREATE FUNCTION turas_record_customer_practice_support(attempt uuid,owner_principal uuid,login_session uuid,account uuid,snapshots text[]) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 DECLARE conversation uuid;workspace uuid;environment text; BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Named content appends require READ COMMITTED' USING ERRCODE='25001'; END IF;

  IF snapshots IS NULL OR cardinality(snapshots) NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM unnest(snapshots) id WHERE id IS NULL OR id !~ '^[a-f0-9]{64}$') THEN
   RAISE EXCEPTION 'Bounded public practice identifiers required' USING ERRCODE='23514'; END IF;
  SELECT authority.conversation_id,authority.workspace_id,authority.environment_id INTO conversation,workspace,environment
   FROM public.ordinary_chat_authorities authority JOIN public.general_context_receipts receipt ON receipt.attempt_id=authority.attempt_id
   JOIN public.conversations owned ON owned.id=authority.conversation_id AND owned.owner_principal_id=authority.owner_principal_id AND owned.workspace_id=authority.workspace_id AND owned.environment_id=authority.environment_id
   JOIN public.login_sessions session ON session.id=authority.login_session_id AND session.id=login_session AND session.principal_id=authority.owner_principal_id AND session.membership_id=authority.membership_id AND session.workspace_id=authority.workspace_id AND session.revoked_at IS NULL AND session.expires_at>clock_timestamp()
   JOIN public.memberships membership ON membership.id=authority.membership_id AND membership.active
   JOIN public.principals principal ON principal.id=membership.principal_id AND principal.active
   JOIN public.workspaces active_workspace ON active_workspace.id=membership.workspace_id AND active_workspace.active
   LEFT JOIN public.partner_organizations org ON org.id=membership.partner_org_id
   WHERE authority.attempt_id=attempt AND authority.owner_principal_id=owner_principal AND authority.valid_until>clock_timestamp()
    AND(membership.kind='internal' OR(org.active AND EXISTS(SELECT 1 FROM public.customer_grants grant_row WHERE grant_row.membership_id=membership.id AND grant_row.customer_id=account AND grant_row.state='active')))
    AND EXISTS(SELECT 1 FROM public.customer_references customer WHERE customer.id=account AND customer.workspace_id=authority.workspace_id)
    AND EXISTS(SELECT 1 FROM public.general_customer_read_scopes scope WHERE scope.attempt_id=attempt AND scope.customer_id=account);
  IF conversation IS NULL OR NOT EXISTS(SELECT 1 FROM public.ordinary_named_content_coverage WHERE conversation_id=conversation AND coverage='complete')
   OR NOT EXISTS(SELECT 1 FROM public.operations_control WHERE environment_id=environment AND mode='open') THEN
   RAISE EXCEPTION 'Current public practice owner scope required' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(snapshots) id WHERE NOT EXISTS(
   SELECT 1 FROM public.turas_evidence_snapshots snapshot JOIN public.turas_vercel_practice_sources mapping ON mapping.environment_id=snapshot.environment_id AND mapping.workspace_id=snapshot.workspace_id AND mapping.snapshot_id=snapshot.id
   WHERE snapshot.id=id AND snapshot.environment_id=environment AND snapshot.workspace_id=workspace::text
    AND NOT EXISTS(SELECT 1 FROM public.turas_evidence_snapshots newer WHERE newer.environment_id=snapshot.environment_id AND newer.workspace_id=snapshot.workspace_id AND newer.url=snapshot.url AND newer.checked_at>snapshot.checked_at AND newer.content_hash<>snapshot.content_hash))) THEN
   RAISE EXCEPTION 'Public practice source changed' USING ERRCODE='23514'; END IF;
  INSERT INTO public.ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
   SELECT conversation,account,'attributed_research:'||head.id::text,attempt FROM public.turas_evidence_snapshots snapshot
   JOIN public.evidence_sources canonical ON canonical.workspace_id=workspace AND canonical.customer_id=account AND canonical.origin='independent_research' AND canonical.canonical_location=snapshot.url
   JOIN LATERAL(SELECT id FROM public.evidence_source_revisions revision WHERE revision.source_id=canonical.id ORDER BY version DESC LIMIT 1) head ON true
   WHERE snapshot.id=ANY(snapshots) AND snapshot.environment_id=environment AND snapshot.workspace_id=workspace::text ON CONFLICT DO NOTHING;

 END $$;
 REVOKE ALL ON FUNCTION turas_record_customer_practice_support(uuid,uuid,uuid,uuid,text[]) FROM PUBLIC;
 GRANT EXECUTE ON FUNCTION turas_record_customer_practice_support(uuid,uuid,uuid,uuid,text[]) TO turas_runtime;
 -- Enforce cumulative bounds at commit, after every scope writer has finished.
 -- A single advisory admission lock avoids parent-row lock-order inversions.
 CREATE FUNCTION turas_named_content_capacity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Named content appends require READ COMMITTED' USING ERRCODE='25001'; END IF;
  PERFORM pg_advisory_xact_lock(16080);
  IF(SELECT count(*) FROM public.ordinary_named_content_dependencies WHERE conversation_id=NEW.conversation_id)>1000 THEN
   RAISE EXCEPTION 'Conversation evidence history exceeds 1000 identifiers; start a new conversation' USING ERRCODE='54000'; END IF;
  RETURN NEW;
 END $$;
 REVOKE ALL ON FUNCTION turas_named_content_capacity() FROM PUBLIC;
 CREATE CONSTRAINT TRIGGER named_content_capacity AFTER INSERT ON ordinary_named_content_dependencies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION turas_named_content_capacity();
 -- Pre-release owner retirement closes old native replay; coverage remains a
 -- permanent read-redaction fence even after native retirement is confirmed.
 INSERT INTO ordinary_native_retirements(id,environment_id,workspace_id,owner_principal_id,conversation_id,native_session_id)
  SELECT gen_random_uuid(),c.environment_id,c.workspace_id,c.owner_principal_id,c.id,c.eve_session_id
  FROM conversations c JOIN ordinary_named_content_coverage coverage ON coverage.conversation_id=c.id AND coverage.coverage='legacy_gap'
  WHERE c.binding_state='bound' AND c.eve_session_id IS NOT NULL ON CONFLICT(conversation_id) DO NOTHING;
 REVOKE ALL ON ordinary_named_content_dependencies,ordinary_named_content_coverage FROM turas_runtime;
 GRANT SELECT ON ordinary_named_content_dependencies,ordinary_named_content_coverage TO turas_runtime;
 UPDATE turas_environment SET schema_version=80 WHERE schema_version=79;
`);
exports.down=()=>{throw Error('Named content retention requires forward recovery');};
