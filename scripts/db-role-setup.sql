-- Run as the migration owner after db:init and after each new migration.
-- Provision the turas_runtime login separately with a unique secret.
GRANT USAGE ON SCHEMA public TO turas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turas_runtime;
REVOKE ALL ON TABLE turas_environment FROM turas_runtime;
GRANT SELECT ON TABLE turas_environment TO turas_runtime;
REVOKE ALL ON TABLE turas_migrations FROM turas_runtime;
DO $$
DECLARE table_name text;
DECLARE payload_lock record;
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
  IF to_regclass('public.workforce_resources') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION turas_purge_workforce_source(uuid,bigint) TO turas_runtime;
    GRANT EXECUTE ON FUNCTION turas_purge_workforce_manual(uuid,bigint) TO turas_runtime;
    FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND (tablename LIKE 'workforce_%' OR tablename LIKE 'staffing_%'
        OR tablename LIKE 'resource_calendar%') LOOP
      IF table_name LIKE '%payloads' THEN
        EXECUTE format('REVOKE UPDATE, DELETE ON TABLE %I FROM turas_runtime',table_name);
      ELSIF table_name NOT IN ('staffing_allocation_days','resource_calendar_days',
          'staffing_write_windows') THEN
        EXECUTE format('REVOKE DELETE ON TABLE %I FROM turas_runtime',table_name);
      END IF;
    END LOOP;
  END IF;
  -- Immutable profile history is append-only even if a future runtime grant drifts.
  FOR table_name IN SELECT unnest(ARRAY[
    'profile_revisions','profile_review_decisions','profile_lifecycle_events',
    'profile_command_receipts','evidence_source_revisions','evidence_source_events',
    'research_checks','evidence_quality_snapshots','profile_evidence_links',
    'evidence_conflict_events',
    'profile_private_lineage','profile_audit_events','context_snapshot_receipts',
    'context_injection_receipts','general_context_receipts','general_context_injections',
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
    ,'workforce_resource_revisions','workforce_partner_eligibility','workforce_skill_revisions',
    'workforce_source_versions','workforce_extractions','workforce_extracted_cells',
    'workforce_mapping_revisions','workforce_competency_revisions','workforce_review_decisions',
    'workforce_command_receipts','resource_calendar_revisions','resource_calendar_intervals',
    'staffing_demand_revisions','staffing_demand_events','staffing_allocation_revisions','staffing_allocation_events','staffing_reservation_expirations','staffing_decisions',
    'staffing_command_receipts','staffing_match_results','staffing_economic_input_revisions',
    'staffing_finance_policy_decisions','staffing_scenarios','staffing_scenario_inputs',
    'staffing_conversation_bindings','staffing_advisory_dependencies',
    'staffing_model_step_receipts','staffing_model_step_usage_receipts','staffing_advisory_read_receipts','staffing_skill_load_receipts'
  ]) LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE %I FROM turas_runtime', table_name);
    END IF;
  END LOOP;
  -- PostgreSQL row locks require UPDATE on at least one column. These readers
  -- lock payloads against concurrent purge; grant only their immutable key.
  -- BEFORE UPDATE triggers reject even key-to-itself writes. Content columns
  -- and direct DELETE remain denied. Keep this allowlist tied to actual readers.
  FOR payload_lock IN SELECT * FROM (VALUES
    ('plan_revision_payloads','revision_id'),
    ('milestone_baseline_payloads','baseline_id'),
    ('workforce_resource_payloads','revision_id'),
    ('workforce_skill_payloads','revision_id'),
    ('workforce_competency_payloads','revision_id'),
    ('workforce_extraction_payloads','revision_id'),
    ('workforce_extracted_cell_payloads','revision_id'),
    ('workforce_mapping_payloads','revision_id'),
    ('resource_calendar_payloads','revision_id'),
    ('staffing_demand_payloads','revision_id'),
    ('staffing_allocation_payloads','revision_id'),
    ('staffing_economic_input_payloads','revision_id'),
    ('staffing_scenario_payloads','scenario_id'),
    ('staffing_advisory_read_payloads','receipt_id')
  ) AS payloads(table_name,key_column) LOOP
    IF to_regclass('public.' || payload_lock.table_name) IS NOT NULL THEN
      EXECUTE format('GRANT UPDATE (%I) ON TABLE %I TO turas_runtime',
        payload_lock.key_column,payload_lock.table_name);
    END IF;
  END LOOP;
END;
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turas_runtime;

-- 008: runtime history is append-only; payload deletion belongs to cleanup.
DO $$ DECLARE t text; BEGIN
  IF to_regclass('public.execution_workspaces') IS NOT NULL THEN
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='turas_execution_cleanup') THEN
      CREATE ROLE turas_execution_cleanup NOLOGIN;
    END IF;
    GRANT USAGE ON SCHEMA public TO turas_execution_cleanup;
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'execution_%' LOOP
      EXECUTE format('REVOKE ALL ON TABLE %I FROM turas_runtime',t);
      EXECUTE format('REVOKE ALL ON TABLE %I FROM turas_execution_cleanup',t);
      EXECUTE format('GRANT SELECT, INSERT ON TABLE %I TO turas_runtime',t);
      IF t IN ('execution_workspaces','execution_records','execution_milestone_heads','execution_time_entries',
        'execution_actual_days','execution_resource_days','execution_effort_heads','execution_advice_attempts','execution_rate_windows') THEN
        EXECUTE format('GRANT UPDATE ON TABLE %I TO turas_runtime',t);
      END IF;
      IF t LIKE '%payloads' THEN EXECUTE format('GRANT SELECT, DELETE ON TABLE %I TO turas_execution_cleanup',t); END IF;
    END LOOP;
    GRANT SELECT, UPDATE, DELETE ON execution_cleanup_jobs TO turas_execution_cleanup;
    GRANT SELECT ON execution_record_revisions,execution_record_sources,execution_review_decisions,
      execution_milestone_events,execution_time_revisions,execution_time_decisions,execution_advice_attempts,
      execution_workspaces,execution_reconciliations TO turas_execution_cleanup;
  END IF;
END $$;
