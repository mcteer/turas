-- Run as the migration owner after db:init and after each new migration.
-- Provision the turas_runtime login separately with a unique secret.
GRANT USAGE ON SCHEMA public TO turas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turas_runtime;
REVOKE ALL ON TABLE turas_environment FROM turas_runtime;
GRANT SELECT ON TABLE turas_environment TO turas_runtime;
REVOKE ALL ON TABLE turas_migrations FROM turas_runtime;
DO $$
DECLARE table_name text;
BEGIN
  IF to_regclass('public.access_audit') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE access_audit FROM turas_runtime;
  END IF;
  IF to_regclass('public.artifact_evidence_payloads') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE artifact_evidence_payloads FROM turas_runtime;
  END IF;
  IF to_regclass('public.artifact_context_payloads') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE artifact_context_payloads FROM turas_runtime;
  END IF;
  IF to_regclass('public.knowledge_revision_payloads') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE knowledge_revision_payloads FROM turas_runtime;
  END IF;
  IF to_regclass('public.research_observation_payloads') IS NOT NULL THEN
    REVOKE UPDATE ON TABLE research_observation_payloads FROM turas_runtime;
  END IF;
  IF to_regclass('public.plan_revision_payloads') IS NOT NULL THEN
    REVOKE DELETE ON TABLE delivery_plans FROM turas_runtime;
    REVOKE DELETE ON TABLE engagements FROM turas_runtime;
    REVOKE UPDATE, DELETE ON TABLE plan_revision_payloads FROM turas_runtime;
    REVOKE UPDATE, DELETE ON TABLE plan_event_payloads FROM turas_runtime;
    REVOKE UPDATE, DELETE ON TABLE plan_decision_payloads FROM turas_runtime;
    REVOKE UPDATE, DELETE ON TABLE milestone_baseline_payloads FROM turas_runtime;
    REVOKE UPDATE, DELETE ON TABLE plan_drafting_instruction_payloads FROM turas_runtime;
    GRANT EXECUTE ON FUNCTION turas_purge_plan_revision_payload(uuid) TO turas_runtime;
    GRANT EXECUTE ON FUNCTION turas_prune_plan_ephemera(text,integer) TO turas_runtime;
  END IF;
  IF to_regclass('public.artifact_native_retirement_receipts') IS NOT NULL THEN
    REVOKE DELETE ON TABLE artifact_native_retirement_receipts FROM turas_runtime;
  END IF;
  IF to_regclass('public.artifact_context_tool_reads') IS NOT NULL THEN
    REVOKE DELETE ON TABLE artifact_context_tool_reads FROM turas_runtime;
  END IF;
  -- Immutable profile history is append-only even if a future runtime grant drifts.
  FOR table_name IN SELECT unnest(ARRAY[
    'profile_revisions','profile_review_decisions','profile_lifecycle_events',
    'profile_command_receipts','evidence_source_revisions','evidence_source_events',
    'research_checks','evidence_quality_snapshots','profile_evidence_links',
    'evidence_conflict_events',
    'profile_private_lineage','profile_audit_events','context_snapshot_receipts',
    'context_injection_receipts',
    'artifacts','artifact_upload_batches',
    'artifact_context_receipts','artifact_context_injection_receipts',
    'conversation_artifact_dependencies',
    'artifact_lifecycle_events',
    'knowledge_revisions','knowledge_lineage','knowledge_decisions',
    'knowledge_submit_receipts',
    'research_request_revisions','research_cancel_receipts',
    'research_discovery_results','evidence_conflict_target_receipts',
    'research_observations','research_evidence_links','research_refresh_observations',
    'retrieval_receipts','retrieval_receipt_sources','session_evidence_dependencies'
    ,'plan_revisions','plan_source_dependencies','plan_private_dependencies',
    'plan_revision_events','plan_decisions','milestone_baselines',
    'planning_conversation_bindings','plan_command_receipts',
    'plan_drafting_source_dependencies','plan_drafting_context_chunks'
  ]) LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE %I FROM turas_runtime', table_name);
    END IF;
  END LOOP;
END;
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turas_runtime;
