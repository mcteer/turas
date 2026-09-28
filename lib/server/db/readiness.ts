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

export async function assertDatabaseEnvironment(
  minimumSchemaVersion = requiredSchemaVersion,
  expectedEnvironment = getServerConfig().TURAS_ENVIRONMENT_ID,
  read: () => Promise<{ rowCount: number | null; rows: EnvironmentRow[] }> = () => query<EnvironmentRow>(environmentSql),
): Promise<void> {
  try {
    const result = await read();
    if (result.rowCount !== 1 || result.rows[0]?.environment_id !== expectedEnvironment ||
      result.rows[0]?.schema_version < minimumSchemaVersion) {
      throw new DatabaseUnavailableError();
    }
  } catch {
    throw new DatabaseUnavailableError();
  }
}
