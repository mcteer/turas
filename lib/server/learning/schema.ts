import type { PoolClient } from 'pg';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
export async function assertLearningReady(db: PoolClient): Promise<void> {
  const marker = (await db.query('SELECT environment_id,schema_version FROM turas_environment LIMIT 1')).rows[0];
  if (marker?.environment_id !== getServerConfig().TURAS_ENVIRONMENT_ID || Number(marker.schema_version) < 54)
    throw new HttpFailure(503, 'unavailable', 'Learning is unavailable');
}
export async function learningWorkspaceState(db: PoolClient, workspaceId: string) {
  await assertLearningReady(db);
  const row = (await db.query(`SELECT version,enabled,gate_activated_at FROM turas_learning_lock_state($1,$2)`, [getServerConfig().TURAS_ENVIRONMENT_ID, workspaceId])).rows[0];
  if (!row) throw new HttpFailure(503, 'unavailable', 'Learning is unavailable');
  return { version: Number(row.version), enabled: row.enabled === true, activatedAt: row.gate_activated_at as Date | null };
}
export async function assertLearningAdmission(db: PoolClient, workspaceId: string): Promise<void> {
  if (!(await learningWorkspaceState(db, workspaceId)).enabled)
    throw new HttpFailure(503, 'learning_disabled', 'New learning work is disabled');
}
