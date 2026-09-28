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
    'artifact_lifecycle_events'
  ]) LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE UPDATE, DELETE ON TABLE %I FROM turas_runtime', table_name);
    END IF;
  END LOOP;
END;
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turas_runtime;
