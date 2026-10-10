import type { PoolClient } from 'pg';
import type { CurrentSession } from '../auth/sessions';
import { HttpFailure } from '../../contracts/http';
import { lockWorkspaceActor, lockProfileActor } from '../profiles/policy';
import { requireKnowledgePublisher } from '../knowledge/policy';
import { assertLearningReady } from './schema';
export async function lockLearningActor(db: PoolClient, actor: CurrentSession, customerId?: string): Promise<void> {
  await assertLearningReady(db);
  if (customerId) await lockProfileActor(db, actor, customerId);
  else await lockWorkspaceActor(db, actor);
}
export async function lockInternalLearningActor(db: PoolClient, actor: CurrentSession, customerId?: string): Promise<void> {
  await lockLearningActor(db, actor, customerId);
  if (actor.kind !== 'internal') throw new HttpFailure(403, 'forbidden', 'Action not allowed');
}
export async function lockLearningPublisher(db: PoolClient, actor: CurrentSession, customerId?: string): Promise<void> {
  await lockLearningActor(db, actor, customerId);
  requireKnowledgePublisher(actor);
}
/** Membership revisions begin at zero; learning authority generations begin at one. */
export async function learningActorGeneration(db: PoolClient, actor: CurrentSession): Promise<number> {
  const row = (await db.query('SELECT revision FROM memberships WHERE id=$1 AND workspace_id=$2', [actor.membershipId, actor.workspaceId])).rows[0];
  const generation = Number(row?.revision) + 1;
  if (!row || !Number.isSafeInteger(generation) || generation < 1)
    throw new HttpFailure(503, 'unavailable', 'Learning authority is unavailable');
  return generation;
}
