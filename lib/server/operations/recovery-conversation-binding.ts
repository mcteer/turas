import {HttpFailure} from '../../contracts/http';
import type {PoolClient} from 'pg';
import {z} from 'zod';
const scope=z.strictObject({environmentId:z.string().min(1),workspaceId:z.uuid(),conversationId:z.uuid(),principalId:z.uuid(),customerId:z.uuid().nullable()});
/** Bind one exact private row. This is metadata, not authority to read it;
 * the runtime still runs the canonical conversation/actor/source policy. */
export async function readRecoveryConversationBinding(db:PoolClient,raw:z.infer<typeof scope>){
 const input=scope.parse(raw),rows=(await db.query(`SELECT encode(sha256(convert_to(to_jsonb(c)::text,'UTF8')),'hex') AS digest,c.revision
  FROM conversations c WHERE c.id=$1 AND c.environment_id=$2 AND c.workspace_id=$3 AND c.owner_principal_id=$4 AND c.customer_id IS NOT DISTINCT FROM $5::uuid`,[input.conversationId,input.environmentId,input.workspaceId,input.principalId,input.customerId])).rows;
 if(rows.length!==1)throw new HttpFailure(403,'recovery_scope_denied','Exact private recovery conversation binding required');
 return {digest:z.string().regex(/^[a-f0-9]{64}$/).parse(rows[0].digest),revision:z.number().int().nonnegative().parse(Number(rows[0].revision))};
}
