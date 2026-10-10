import type { PoolClient } from 'pg';
import { getServerConfig } from '../config';
import { learningLimits } from '../../contracts/learning';
export type LearningPayloadKind='feedback'|'disposition'|'review'|'attempt'|'case_review'|'measurement'|'measurement_review'|'settlement'|'command'|'evaluation'|'rollback';
export function learningPurgeDeadline(at:Date,kind:'obsolete'|'global_invalidated',sourceDeadline?:Date|null):Date {
 const maximum=new Date(at.getTime()+(kind==='obsolete'?learningLimits.obsoleteDays*86400000:learningLimits.invalidatedHours*3600000));
 return sourceDeadline&&sourceDeadline<maximum?sourceDeadline:maximum;
}
/** SQL LEAST preserves earlier source/005 deadlines across repeated reconciliation. */
export async function scheduleLearningPayloadPurge(db:PoolClient,ownerId:string,kind:LearningPayloadKind,reason:'obsolete'|'global_invalidated',at=new Date(),sourceDeadline?:Date|null){
 const deadline=learningPurgeDeadline(at,reason,sourceDeadline);
 await db.query(`INSERT INTO learning_payload_states(owner_id,kind,invalidated_at,obsolete_at,purge_at)
  VALUES($1,$2,$3,$4,$5) ON CONFLICT(kind,owner_id) DO UPDATE SET
  invalidated_at=CASE WHEN EXCLUDED.invalidated_at IS NULL THEN learning_payload_states.invalidated_at ELSE least(learning_payload_states.invalidated_at,EXCLUDED.invalidated_at) END,
  obsolete_at=CASE WHEN EXCLUDED.obsolete_at IS NULL THEN learning_payload_states.obsolete_at ELSE least(learning_payload_states.obsolete_at,EXCLUDED.obsolete_at) END,
  purge_at=least(learning_payload_states.purge_at,EXCLUDED.purge_at)`,[ownerId,kind,reason==='global_invalidated'?at:null,reason==='obsolete'?at:null,deadline]);
 return deadline;
}
export async function purgeLearningPayloads(db:PoolClient,batch=100):Promise<number>{
 if(!Number.isInteger(batch)||batch<1||batch>100)throw Error('Bounded learning purge batch required');
 return Number((await db.query('SELECT turas_learning_purge($1,$2) AS count',[getServerConfig().TURAS_ENVIRONMENT_ID,batch])).rows[0].count);
}
