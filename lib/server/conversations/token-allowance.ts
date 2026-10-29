import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {withTransaction} from '../db/client';
export const ordinaryConversationOutputLimit=20000;

/** Caller already checked owner/current sources. Serialize all reservations in
 * this conversation before provider I/O. Interrupted or missing usage retains
 * its full hold; a steering correction cannot spend it again. */
export async function reserveOrdinaryOutput(db:PoolClient,conversationId:string,attemptId:string,requested:number){
 await db.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE',[conversationId]);
 // Captured immutable allowances have permanent replay fences. Reading an
 // existing allowance must not repeat its original INSERT, even as a no-op.
 if(!(await db.query('SELECT 1 FROM ordinary_conversation_allowances WHERE conversation_id=$1',[conversationId])).rowCount)await db.query(`INSERT INTO ordinary_conversation_allowances(conversation_id,baseline_output_tokens)
  SELECT $1,COALESCE(sum(output_tokens),0)::integer FROM response_attempts WHERE conversation_id=$1
  ON CONFLICT(conversation_id) DO NOTHING`,[conversationId]);
 const usage=(await db.query('SELECT turas_ordinary_output_used($1) AS used',[conversationId])).rows[0]?.used;
 if(usage==null)throw hiddenRecord();
 const used=Number(usage);
 if(!Number.isSafeInteger(used) || used>=ordinaryConversationOutputLimit)throw new HttpFailure(429,'conversation_budget','Conversation output allowance exhausted');
 const ceiling=Math.min(requested,ordinaryConversationOutputLimit-used);
 if(!Number.isSafeInteger(ceiling) || ceiling<1)throw new HttpFailure(429,'conversation_budget','Conversation output allowance exhausted');
 const id=randomUUID();
 const reserved=await db.query(`INSERT INTO ordinary_model_operations(id,conversation_id,attempt_id,ceiling_tokens)
  SELECT $1,$2,id,$4 FROM response_attempts WHERE id=$3 AND conversation_id=$2`,[id,conversationId,attemptId,ceiling]);
 if(reserved.rowCount!==1)throw hiddenRecord();
 return {id,ceiling};
}

export async function settleOrdinaryOutput(id:string,usage:unknown){
 const output=typeof usage==='object' && usage!==null && 'outputTokens' in usage?usage.outputTokens:undefined;
 const total=typeof output==='number'?output:typeof output==='object' && output!==null && 'total' in output?output.total:undefined;
 if(typeof total!=='number' || !Number.isSafeInteger(total) || total<0)return;
 await withTransaction(db=>db.query(`UPDATE ordinary_model_operations SET actual_tokens=$2,settled_at=clock_timestamp()
  WHERE id=$1 AND actual_tokens IS NULL`,[id,total]).then(()=>{}));
}
