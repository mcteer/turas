import {createHash,randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import type {z} from 'zod';
import type {CurrentSession} from '../auth/sessions';
import {withTransaction} from '../db/client';
import {HttpFailure} from '../../contracts/http';
import {lockReportActor,type ReportCapability} from './policy';
import type {ReportAudience} from '../../reports/periods';
import {chargeReportRate} from './rates';
import {canonicalReportJson} from '../../reports/canonical';
import {reportAuditExpired} from '../../reports/retention';
export {canonicalReportJson} from '../../reports/canonical';
export function reportDigest(value:unknown){return createHash('sha256').update(canonicalReportJson(value)).digest('hex');}
export async function reportTransaction<T>(run:(db:PoolClient)=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){try{return await withTransaction(async db=>{await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");return run(db);});}catch(error){if(attempt>=2 || !['40001','40P01'].includes(String((error as {code?:string}).code)))throw error;}}
}
export async function executeReportCommand<T extends {requestKey:string;expectedVersion:number;action:string}>(
 actor:CurrentSession,customerId:string,audience:ReportAudience,capability:ReportCapability,schema:z.ZodType<T>,raw:unknown,
 handler:(db:PoolClient,command:T)=>Promise<Record<string,string|number>>,project:(db:PoolClient,ids:Record<string,string|number>)=>Promise<unknown>,
 options:{settlement?:boolean;published?:boolean;subjectId?:string}={}){
 const parsed=schema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid report command');
 const command=parsed.data,digest=reportDigest({customerId,subjectId:options.subjectId??null,command});
 return reportTransaction(async db=>{
  await lockReportActor(db,actor,customerId,capability,audience,options.published);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`reports:${process.env.TURAS_ENVIRONMENT_ID}:${actor.workspaceId}:${actor.membershipId}:${command.requestKey}`]);
   const prior=(await db.query(`SELECT input_digest,result_ids,created_at FROM report_command_receipts WHERE environment_id=$1 AND workspace_id=$2 AND actor_membership_id=$3 AND request_key=$4`,[process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,actor.membershipId,command.requestKey])).rows[0];
   if(prior){if(prior.input_digest!==digest)throw new HttpFailure(409,'request_conflict','Request key has different input');if(reportAuditExpired(new Date(prior.created_at)))throw new HttpFailure(409,'payload_expired','Report command audit has expired');return project(db,prior.result_ids);}
  await lockReportActor(db,actor,customerId,capability,audience,options.published,!options.settlement);
  const generation=capability==='prepare' || capability==='revise';
  await chargeReportRate(db,actor.workspaceId,`${generation?'generation':'decision'}:${actor.membershipId}`,generation?5:30,600);
  const ids=await handler(db,command);
  await db.query(`INSERT INTO report_command_receipts(id,environment_id,workspace_id,customer_id,actor_membership_id,request_key,action,input_digest,result_ids) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[randomUUID(),process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,actor.membershipId,command.requestKey,command.action,digest,JSON.stringify(ids)]);
  return project(db,ids);
 });
}
