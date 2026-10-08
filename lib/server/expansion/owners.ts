import {retireExpansionAdviceDependency} from './advice-invalidation';
import { randomUUID } from 'node:crypto';
import { HttpFailure } from '../../contracts/http';
import { getServerConfig } from '../config';
import { lockExpansionActor, validateExpansionMembers, expansionAssignment, isExpansionOwnerAdministrator, requireExpansionEnvironment, type ExpansionActor } from './policy';
import { expansionTransaction } from './service';
import { expansionOwnerCommandSchema } from './schema';
import { expansionHash, lockExpansionCommandKey, expansionReceipt, saveExpansionReceipt, admitExpansionCommand, admitExpansionRequest } from './commands';
export async function assignExpansionOwner(actor: ExpansionActor, customerId: string, raw: unknown) {
  const command = expansionOwnerCommandSchema.parse(raw);
  await admitExpansionCommand(actor,customerId,command.requestKey,expansionHash({customerId,command}));
  return expansionTransaction(async db => {
    await lockExpansionActor(db, actor, customerId, command.membershipId ? [command.membershipId] : [],false);
    if (!isExpansionOwnerAdministrator(actor)) throw new HttpFailure(403, 'forbidden', 'Only mcteer manages account-owner assignments');
    await lockExpansionCommandKey(db, actor, command.requestKey);
    const digest = expansionHash({ customerId, command }), prior = await expansionReceipt(db, actor, customerId, command.requestKey, digest);
    if (prior) return prior;
    await requireExpansionEnvironment(db, true);await validateExpansionMembers(db,actor,command.membershipId?[command.membershipId]:[]);
    await db.query(`INSERT INTO expansion_account_owners(customer_id,environment_id,workspace_id) VALUES($1,$2,$3) ON CONFLICT(customer_id) DO NOTHING`,
      [customerId, getServerConfig().TURAS_ENVIRONMENT_ID, actor.workspaceId]);
    const previous = await expansionAssignment(db, actor, customerId, true);
    if (previous.version !== command.expectedVersion) throw new HttpFailure(409, 'owner_changed', 'Account-owner assignment changed; refresh');
    const version = previous.version + 1, eventId = randomUUID();
    await db.query(`UPDATE expansion_account_owners SET owner_membership_id=$2,version=$3,generation=generation+1,updated_at=now() WHERE customer_id=$1`,
      [customerId, command.membershipId, version]);
    await db.query(`INSERT INTO expansion_owner_events(id,customer_id,actor_membership_id,previous_membership_id,next_membership_id,assignment_version,rationale_digest) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [eventId, customerId, actor.membershipId, previous.membershipId, command.membershipId, version, expansionHash(command.rationale)]);
    await db.query(`INSERT INTO expansion_payloads(id,owner_event_id,content,purge_at) VALUES($1,$2,$3,now()+interval '365 days')`,
      [randomUUID(), eventId, { rationale: command.rationale }]);
    await db.query('UPDATE expansion_scopes SET generation=generation+1 WHERE customer_id=$1 AND workspace_id=$2 AND environment_id=$3', [customerId, actor.workspaceId,getServerConfig().TURAS_ENVIRONMENT_ID]);
    await retireExpansionAdviceDependency(db,'account_owner',customerId);
    return saveExpansionReceipt(db, actor, customerId, command.requestKey, digest, { operation: 'assign_owner', recordId: null, revisionId: null,
      decisionId: null, outcome: command.membershipId ? 'assigned' : 'unassigned', version });
  });
}
export async function readExpansionOwners(actor: ExpansionActor, customerId: string) {
  await admitExpansionRequest(actor,customerId,'read');
  return expansionTransaction(async db => {
    await lockExpansionActor(db, actor, customerId);
    const assignment = await expansionAssignment(db, actor, customerId);
    if (!isExpansionOwnerAdministrator(actor)) return { assignment, candidates: [], canManage: false };
    const candidates = (await db.query(`SELECT m.id AS "membershipId",p.login_name AS "displayName" FROM memberships m JOIN principals p ON p.id=m.principal_id
      WHERE m.workspace_id=$1 AND m.kind='internal' AND m.active AND p.active ORDER BY p.login_name,m.id`, [actor.workspaceId])).rows;
    return { assignment, candidates, canManage: true };
  });
}
