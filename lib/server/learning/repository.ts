import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withTransaction } from '../db/client';
import { HttpFailure } from '../../contracts/http';
/** Canonical structural hashing; array order remains semantically significant. */
export function learningCanonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(learningCanonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => `${JSON.stringify(key)}:${learningCanonical(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const learningHash = (value: unknown) => createHash('sha256').update(learningCanonical(value)).digest('hex');
export async function learningDatabaseNow(db:PoolClient):Promise<Date>{
 const value=(await db.query<{now:Date}>('SELECT clock_timestamp() AS now')).rows[0]?.now;
 if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw new HttpFailure(503,'unavailable','Learning clock unavailable');return value;
}
export async function learningTransaction<T>(run: (db: PoolClient) => Promise<T>): Promise<T> {
  return withTransaction(async db => {
    await db.query("SET LOCAL transaction_timeout='30s'");
    await db.query("SET LOCAL statement_timeout='5s'");
    await db.query("SET LOCAL lock_timeout='2s'");
    await db.query("SET LOCAL turas.learning_operation='014'");
    return run(db);
  });
}
export function expectLearningVersion(actual: unknown, expected: number): void {
  if (Number(actual) !== expected) throw new HttpFailure(409, 'stale_version', 'This record changed; reload before continuing');
}
