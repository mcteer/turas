import { getServerConfig } from "../config";
import { query } from "./client";

export class DatabaseUnavailableError extends Error {
  constructor(message = "Database unavailable or not initialized") {
    super(message);
    this.name = "DatabaseUnavailableError";
  }
}

type EnvironmentRow = { environment_id: string; schema_version: number };
const environmentSql = "SELECT environment_id, schema_version FROM turas_environment LIMIT 1";
export const requiredSchemaVersion = 13;
export const supportedSchemaVersion = 57;

export async function assertDatabaseEnvironment(
  minimumSchemaVersion = requiredSchemaVersion,
  expectedEnvironment = getServerConfig().TURAS_ENVIRONMENT_ID,
  read: () => Promise<{ rowCount: number | null; rows: EnvironmentRow[] }> = () => query<EnvironmentRow>(environmentSql),
): Promise<void> {
  try {
    const result = await read();
    if (result.rowCount !== 1 || result.rows[0]?.environment_id !== expectedEnvironment ||
      result.rows[0]?.schema_version < minimumSchemaVersion || result.rows[0]?.schema_version > supportedSchemaVersion) {
      throw new DatabaseUnavailableError();
    }
  } catch {
    throw new DatabaseUnavailableError();
  }
}

/** Full pilot health requires this code's exact ledger and runtime restrictions. */
export async function assertPilotDatabaseEnvironment(expectedEnvironment = getServerConfig().TURAS_ENVIRONMENT_ID): Promise<void> {
  return assertPilotDatabaseOnConnection(expectedEnvironment, query);
}

/** Operator validation uses an explicitly supplied runtime connection. The same
 * schema and privilege policy applies without loading the selected local DB. */
export async function assertPilotDatabaseOnConnection(expectedEnvironment: string, read: typeof query): Promise<void> {
  try {
    await assertDatabaseEnvironment(supportedSchemaVersion, expectedEnvironment, () => read<EnvironmentRow>(environmentSql));
    const { default: manifest } = await import("../../../migrations/manifest.json");
    const ledger = await read<{name:string}>("SELECT name FROM turas_migrations ORDER BY name");
    const expected = manifest.migrations.map(entry=>entry.file.replace(/\.cjs$/, "")).sort();
    if (ledger.rowCount !== expected.length || ledger.rows.some((row,index)=>row.name!==expected[index])) throw new DatabaseUnavailableError();
    const privileges = await read<{valid:boolean}>(`SELECT
      has_table_privilege(current_user,'operations_control','SELECT')
      AND NOT has_table_privilege(current_user,'operations_control','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_control','INSERT')
      AND NOT has_table_privilege(current_user,'operations_control','DELETE')
      AND NOT has_table_privilege(current_user,'operations_recovery_verifications','INSERT')
      AND NOT has_table_privilege(current_user,'operations_recovery_verifications','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_recovery_verifications','DELETE')
      AND has_table_privilege(current_user,'operations_source_denials','SELECT')
      AND NOT has_table_privilege(current_user,'operations_source_denials','INSERT')
      AND NOT has_table_privilege(current_user,'operations_source_denials','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_source_denials','DELETE')
      AND has_table_privilege(current_user,'operations_replay_fences','SELECT')
      AND NOT has_table_privilege(current_user,'operations_replay_fences','INSERT')
      AND NOT has_table_privilege(current_user,'operations_replay_fences','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_replay_fences','DELETE')
      AND has_table_privilege(current_user,'operations_recovery_quarantines','SELECT')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantines','INSERT')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantines','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantines','DELETE')
      AND has_table_privilege(current_user,'operations_recovery_quarantine_resolutions','SELECT')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantine_resolutions','INSERT')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantine_resolutions','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_recovery_quarantine_resolutions','DELETE')
      AND NOT has_table_privilege(current_user,'operations_local_jobs','DELETE')
      AND has_column_privilege(current_user,'operations_health_samples','code_version','INSERT')
      AND NOT has_column_privilege(current_user,'operations_health_samples','sampled_at','INSERT')
      AND NOT has_table_privilege(current_user,'operations_health_samples','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_health_samples','DELETE')
      AND has_table_privilege(current_user,'operations_backup_observations','SELECT')
      AND NOT has_table_privilege(current_user,'operations_backup_observations','INSERT')
      AND NOT has_table_privilege(current_user,'operations_backup_observations','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_backup_observations','DELETE')
      AND has_table_privilege(current_user,'operations_store_observations','SELECT')
      AND has_column_privilege(current_user,'operations_store_observations','proof_digest','INSERT')
      AND NOT has_column_privilege(current_user,'operations_store_observations','sampled_at','INSERT')
      AND NOT has_table_privilege(current_user,'operations_store_observations','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_store_observations','DELETE')
      AND NOT has_table_privilege(current_user,'turas_environment','UPDATE')
      AND NOT has_table_privilege(current_user,'turas_migrations','UPDATE')
      AND has_table_privilege(current_user,'operations_cost_budgets','SELECT')
      AND NOT has_table_privilege(current_user,'operations_cost_budgets','INSERT')
      AND NOT has_column_privilege(current_user,'operations_cost_budgets','cap_micro_usd','UPDATE')
      AND NOT has_column_privilege(current_user,'operations_cost_budgets','state','UPDATE')
      AND NOT has_column_privilege(current_user,'operations_cost_reservations','charged_micro_usd','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_cost_reservations','DELETE')
      AND has_table_privilege(current_user,'operations_cost_reconciliations','SELECT')
      AND NOT has_table_privilege(current_user,'operations_cost_reconciliations','INSERT')
      AND NOT has_table_privilege(current_user,'operations_cost_reconciliations','UPDATE')
      AND NOT has_table_privilege(current_user,'operations_cost_reconciliations','DELETE')
      AND NOT has_schema_privilege(current_user,'public','CREATE')
      AND NOT has_database_privilege(current_user,current_database(),'CREATE')
      AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND pg_has_role(current_user,c.relowner,'MEMBER'))
      AND NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND pg_has_role(current_user,p.proowner,'MEMBER'))
      AND NOT rolsuper AND NOT rolcreaterole AND NOT rolcreatedb AND NOT rolreplication AND NOT rolbypassrls AS valid
      FROM pg_roles WHERE rolname=current_user`);
    if (privileges.rowCount!==1 || privileges.rows[0].valid!==true) throw new DatabaseUnavailableError();
  } catch { throw new DatabaseUnavailableError(); }
}
