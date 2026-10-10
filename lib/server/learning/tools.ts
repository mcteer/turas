import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { FeaturePrincipal } from '../conversations/feature';
import { HttpFailure } from '../../contracts/http';
import { learningTransaction,learningHash } from './repository';
import { boundLearningDraftActor } from './tool-actor';
import { learningReadSchemas } from './model-budget';
import { assertLearningAdmission } from './schema';
export async function runLearningRead(principal:FeaturePrincipal,name:keyof typeof learningReadSchemas,raw:unknown,callId:string){
 if(!callId||callId.length>200||!(name in learningReadSchemas))throw new HttpFailure(403,'learning_tool_denied','Learning read identity required');
 const input=learningReadSchemas[name].parse(raw);
 const skill=name==='load_skill'?await readFile(resolve(process.cwd(),'agent/skills/governed-learning/SKILL.md'),'utf8'):null;
 return learningTransaction(async db=>{
  const bound=await boundLearningDraftActor(db,principal);await assertLearningAdmission(db,bound.actor.workspaceId);
  const snapshot=bound.snapshot as {question:string;unknowns:unknown[];baseline:unknown;evidence:Array<{key:string;content:unknown;kind:string}>};
  const keys=name==='learning_evidence'?(input as {sourceKeys:string[]}).sourceKeys:[];
  if(keys.some(key=>!bound.sourceMap.some(source=>source.key===key)))throw new HttpFailure(404,'not_found','Learning source unavailable');
  const output=name==='load_skill'?skill:name==='learning_summary'?{purpose:'draft',question:snapshot.question,selectedOriginalKeys:bound.sourceMap.map(s=>s.key),baseline:snapshot.baseline,unknowns:snapshot.unknowns}:snapshot.evidence.filter(e=>keys.includes(e.key));
  const bytes=Buffer.byteLength(JSON.stringify(output)),digest=learningHash(output),inputDigest=learningHash(input);
  const prior=(await db.query('SELECT * FROM learning_read_receipts WHERE attempt_id=$1 AND call_id=$2',[bound.attemptId,callId])).rows[0];
  if(prior){if(prior.tool_name!==name||prior.input_digest!==inputDigest||prior.output_digest!==digest)throw new HttpFailure(409,'learning_read_changed','Learning read replay changed');return output;}
  if(bound.counters.readCalls>=6||bound.counters.contextBytes+bytes>24576)throw new HttpFailure(429,'learning_context_budget','Learning read budget reached');
  await db.query('INSERT INTO learning_read_receipts(attempt_id,call_id,tool_name,input_digest,output_digest,bytes) VALUES($1,$2,$3,$4,$5,$6)',[bound.attemptId,callId,name,inputDigest,digest,bytes]);
  await db.query('UPDATE learning_attempts SET read_calls=read_calls+1,context_bytes=context_bytes+$2,version=version+1 WHERE id=$1',[bound.attemptId,bytes]);
  return output;
 });
}
