-- Run as the migration owner after db:init and after each new migration.
-- Provision the turas_runtime login separately with a unique secret.
GRANT USAGE ON SCHEMA public TO turas_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO turas_runtime;
REVOKE ALL ON TABLE turas_environment FROM turas_runtime;
GRANT SELECT ON TABLE turas_environment TO turas_runtime;
REVOKE ALL ON TABLE turas_migrations FROM turas_runtime;
DO $$
BEGIN
  IF to_regclass('public.access_audit') IS NOT NULL THEN
    REVOKE UPDATE, DELETE ON TABLE access_audit FROM turas_runtime;
  END IF;
END;
$$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO turas_runtime;
