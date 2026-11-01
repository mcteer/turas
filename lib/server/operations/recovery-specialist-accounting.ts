import type {Client,PoolClient} from 'pg';
import {z} from 'zod';
import type {recoveryDenialSnapshotSchema} from './recovery-denial-snapshot';
const number=z.coerce.number().int().nonnegative().safe(),uuid=z.uuid(),time=z.iso.datetime({offset:true});
const metadata=z.object({discussion_id:uuid,assignment_id:uuid,native_step_key:z.string().min(1).max(512),
 ceiling_input_tokens:number,ceiling_output_tokens:number,ceiling_micro_usd:number,
 actual_input_tokens:number.nullable(),actual_output_tokens:number.nullable(),actual_micro_usd:number.nullable(),
 settled_at:time.nullable(),completed_at:time.nullable()}).superRefine((row,ctx)=>{
 const actual=[row.actual_input_tokens,row.actual_output_tokens,row.actual_micro_usd];
 if(row.settled_at===null?actual.some(value=>value!==null):actual.some(value=>value===null))ctx.addIssue({code:'custom',message:'Complete specialist accounting receipt required'});
});
type Snapshot=z.infer<typeof recoveryDenialSnapshotSchema>;
type Scope={environmentId:string;recoveryId:string;controlRevision:number;snapshotDigest:string};
/** Existing owner-only, locked recovery transaction. Preserve only opaque
 * identities and accounting, never prompts, results or child control tokens.
 * Original holds remain immutable; later observations cannot refund uncertainty. */
export async function reconcileSpecialistRecoveryAccounting(db:Client|PoolClient,snapshot:Snapshot,scope:Scope){
 const discussions=new Map((snapshot.tables.find(t=>t.name==='specialist_discussions')?.rows??[]).map(row=>[uuid.parse(row.identity.id),row.status]));
 const holds=[] as Array<z.infer<typeof metadata>&{id:string;conversationId:string;evidenceDigest:string;evidenceDigestKind:'snapshot'|'operation_row';capturedAt:string;evidenceKind:'operation'|'inherited_hold'}>;
 for(const entry of snapshot.tables){
  if(entry.name!=='specialist_operations'&&entry.name!=='operations_recovery_model_holds')continue;
  for(const row of entry.rows){
   const inherited=entry.name==='operations_recovery_model_holds';
   if(inherited&&row.identity.operation_kind!=='specialist')continue;
   const value=metadata.parse(row.status),discussion=discussions.get(value.discussion_id);
   const conversationId=uuid.parse(inherited?row.status.scope_id:discussion?.conversation_id);
   if(inherited&&row.identity.environment_id!==scope.environmentId||discussion&&(discussion.environment_id!==scope.environmentId||discussion.conversation_id!==conversationId))throw Error('Recovered specialist scope differs');
   holds.push({...value,id:uuid.parse(inherited?row.identity.operation_id:row.identity.id),conversationId,
    evidenceDigest:inherited?z.string().regex(/^[a-f0-9]{64}$/).parse(row.status.evidence_digest):snapshot.snapshotDigest,
    evidenceDigestKind:inherited?z.enum(['snapshot','operation_row']).parse(row.status.evidence_digest_kind):'snapshot',
    capturedAt:inherited?time.parse(row.status.source_captured_at):snapshot.capturedAt,evidenceKind:inherited?'inherited_hold':'operation'});
  }
 }
 let added=0;
 for(const hold of holds){
  const {id,conversationId,evidenceDigest,evidenceDigestKind,capturedAt,evidenceKind,...value}=hold;
  const columns=Object.keys(value),values=Object.values(value);
  added+=(await db.query(`INSERT INTO operations_recovery_model_holds(environment_id,operation_kind,operation_id,scope_id,evidence_digest,evidence_digest_kind,source_captured_at,recovery_id,control_revision,${columns.join(',')})
   VALUES($1,'specialist',$2,$3,$4,'snapshot',$5,$6,$7,${values.map((_,i)=>'$'+(i+8)).join(',')}) ON CONFLICT(environment_id,operation_kind,operation_id) DO NOTHING`,
   [scope.environmentId,id,conversationId,snapshot.snapshotDigest,snapshot.capturedAt,scope.recoveryId,scope.controlRevision,...values])).rowCount??0;
  const retained=(await db.query("SELECT * FROM operations_recovery_model_holds WHERE environment_id=$1 AND operation_kind='specialist' AND operation_id=$2",[scope.environmentId,id])).rows[0];
  const local=(await db.query('SELECT o.*,d.conversation_id AS scope_id FROM specialist_operations o JOIN specialist_discussions d ON d.id=o.discussion_id WHERE o.id=$1',[id])).rows[0];
  for(const row of [retained,local])if(row){
   if(row.scope_id!==conversationId||row.discussion_id!==value.discussion_id||row.assignment_id!==value.assignment_id||row.native_step_key!==value.native_step_key||
    ['ceiling_input_tokens','ceiling_output_tokens','ceiling_micro_usd'].some(key=>Number(row[key])!==value[key as keyof typeof value])||
    ['actual_input_tokens','actual_output_tokens','actual_micro_usd'].some(key=>row[key]!==null&&value[key as keyof typeof value]!==null&&Number(row[key])!==value[key as keyof typeof value]))throw Error('Recovered immutable specialist operation differs');
  }
  await observation(db,scope,snapshot,id,value,{digest:evidenceDigest,kind:evidenceDigestKind,at:capturedAt,evidenceKind});
 }
 // Preserve already-retained independent observations through another restore.
 for(const row of snapshot.tables.find(t=>t.name==='operations_recovery_model_observations')?.rows??[]){
  if(row.identity.operation_kind!=='specialist')continue;
  if(row.identity.environment_id!==scope.environmentId)throw Error('Recovered specialist observation scope differs');
  await observation(db,scope,snapshot,uuid.parse(row.identity.operation_id),metadata.parse(row.status),{
   digest:z.string().regex(/^[a-f0-9]{64}$/).parse(row.identity.observed_evidence_digest),kind:z.enum(['snapshot','operation_row']).parse(row.status.observed_digest_kind),
   at:time.parse(row.status.observed_captured_at),evidenceKind:z.enum(['operation','inherited_hold']).parse(row.identity.evidence_kind)});
 }
 await retireRecoveredSpecialists(db,scope.environmentId);
 return added;
}
async function observation(db:Client|PoolClient,scope:Scope,snapshot:Snapshot,id:string,value:z.infer<typeof metadata>,evidence:{digest:string;kind:'snapshot'|'operation_row';at:string;evidenceKind:'operation'|'inherited_hold'}){
 const hold=(await db.query("SELECT * FROM operations_recovery_model_holds WHERE environment_id=$1 AND operation_kind='specialist' AND operation_id=$2",[scope.environmentId,id])).rows[0];
 if(!hold||hold.discussion_id!==value.discussion_id||hold.assignment_id!==value.assignment_id||hold.native_step_key!==value.native_step_key||
  ['ceiling_input_tokens','ceiling_output_tokens','ceiling_micro_usd'].some(key=>Number(hold[key])!==value[key as keyof typeof value])||
  ['actual_input_tokens','actual_output_tokens','actual_micro_usd'].some(key=>hold[key]!==null&&value[key as keyof typeof value]!==null&&Number(hold[key])!==value[key as keyof typeof value]))throw Error('Recovered specialist observation differs');
 const columns=Object.keys(value),values=Object.values(value);
 await db.query(`INSERT INTO operations_recovery_model_observations(environment_id,operation_kind,operation_id,observed_evidence_digest,observed_captured_at,observed_digest_kind,evidence_kind,snapshot_digest,source_captured_at,recovery_id,control_revision,${columns.join(',')})
  VALUES($1,'specialist',$2,$3,$4,$5,$6,$7,$8,$9,$10,${values.map((_,i)=>'$'+(i+11)).join(',')}) ON CONFLICT(environment_id,operation_kind,operation_id,observed_evidence_digest,evidence_kind) DO NOTHING`,
  [scope.environmentId,id,evidence.digest,evidence.at,evidence.kind,evidence.evidenceKind,snapshot.snapshotDigest,snapshot.capturedAt,scope.recoveryId,scope.controlRevision,...values]);
}
export async function retireRecoveredSpecialists(db:Client|PoolClient,environmentId:string){
 await db.query("UPDATE specialist_assignments a SET state='unavailable',reason_code='recovery_current_proof_unavailable',updated_at=clock_timestamp() FROM specialist_discussions d WHERE a.discussion_id=d.id AND d.environment_id=$1 AND a.state IN('admitted','working','waiting_input','stopping')",[environmentId]);
 await db.query("UPDATE specialist_discussions SET state='closed',closed_at=clock_timestamp(),close_reason='recovery_current_proof_unavailable',version=version+1 WHERE environment_id=$1 AND state IN('open','stopping')",[environmentId]);
}
