import {registerOperationsRead,operationsReadDigest,type OperationsReadKind} from './consumption';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withTransaction} from '../db/client';
import type {CurrentSession} from '../auth/sessions';
import {lockWorkspaceActor} from '../profiles/policy';
import {customerQuestionActor} from '../conversations/customer-accounts';
import {readEngagement} from '../engagements/read';
import {executionRecordSchema} from '../execution/schema';
import {readExecutionRecords} from '../execution/service';
import {selectExecutionSummarySnapshot} from '../execution/summary';
import {listResources} from '../staffing/read';
import {readCalendar} from '../staffing/calendars';
import {lockStaffingActor,requireStaffingCapability} from '../staffing/policy';
import {listFinanceInputs,readFinanceInput} from '../staffing/economics';
import {staffingCurrencySchema} from '../../contracts/staffing-economics';
import {getServerConfig} from '../config';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import {engagementMetrics,portfolioMetrics,wholeEngagementBasis,wholeEngagementScenario} from './calculations';
export const periodSchema=z.object({fromDate:z.iso.date(),toDate:z.iso.date()}).refine(v=>v.toDate>=v.fromDate&&(Date.parse(v.toDate)-Date.parse(v.fromDate))/86400000<=90,'Choose one to 91 inclusive dates');
export const engagementInputSchema=z.object({engagementId:z.uuid(),...periodSchema.shape}).strict().refine(v=>periodSchema.safeParse(v).success);
// Parse the period separately: strict schemas must not receive engagement IDs.
const period=(v:{fromDate:string;toDate:string})=>periodSchema.parse({fromDate:v.fromDate,toDate:v.toDate});
type Principal=Parameters<typeof customerQuestionActor>[1];
export async function ordinaryActor(db:PoolClient,principal:Principal){
 const scope=await customerQuestionActor(db,principal);
 const {conversationFeature}=await import('../conversations/feature');
 const row=(await db.query('SELECT conversation_id FROM response_attempts WHERE id=$1',[scope.attemptId])).rows[0];
 if(!row || (await conversationFeature(db,row.conversation_id))?.kind!=='normal')throw hiddenRecord();
 return scope;
}
async function capacitySnapshot(db:PoolClient,actor:CurrentSession,input:z.infer<typeof periodSchema>){
  await lockStaffingActor(db,actor,'operational');
  const capacity=[];let cursor:string|undefined;
  do{const page=await listResources(actor,{pageSize:50,...(cursor?{cursor}:{})},db);
   for(const resource of page.items){
    const calendar=await readCalendar(actor,resource.resourceId,input,db);
    // Manager authoring intervals/rationale are never exposed through this read tool.
    const {manager:_manager,...operational}=calendar;
    capacity.push({resource,calendar:operational});
   }
   cursor=page.nextCursor??undefined;
   if(capacity.length>500)throw new HttpFailure(422,'scope_too_large','Narrow the capacity roster');
  }while(cursor);
  return {synthetic:false,asOf:new Date().toISOString(),period:input,capacity,complete:true,notice:'Dated operational capacity; missing calendar dates remain unknown. No other customer assignments or private personnel notes are returned.'};
}
export async function readOrdinaryCapacity(principal:Principal,raw:unknown){const input=periodSchema.parse(raw);return withTransaction(async db=>{const scope=await ordinaryActor(db,principal);const result=await capacitySnapshot(db,scope.actor,input);await registerOperationsRead(db,scope,'capacity',input,result,[]);return result;});}
async function economics(db:PoolClient,actor:Parameters<typeof readEngagement>[0],engagement:Awaited<ReturnType<typeof readEngagement>>,scope:{fromDate:string;toDate:string},effort:{actualLifetimeMinutes:string|null;remainingMinutes:string|null}){
 try{requireStaffingCapability(actor,'finance');}catch{return {status:'withheld' as const,reason:'finance_access_required'};}
 await lockStaffingActor(db,actor,'finance',{customerId:engagement.customerId});
 const inputs=[];let cursor:string|undefined;
 do{const page=await listFinanceInputs(actor,{engagementId:engagement.engagementId,baselineId:engagement.activeBaselineId,pageSize:50,...(cursor?{cursor}:{})},db);
  for(const item of page.items)inputs.push(await readFinanceInput(actor,item.inputId,db));
  cursor=page.nextCursor??undefined;if(inputs.length>500)throw new HttpFailure(422,'scope_too_large','Narrow finance inputs');
 }while(cursor);
 // Contracted totals are exact half-open periods; never prorate or sum currencies.
 const until=new Date(Date.parse(scope.toDate)+86400000).toISOString().slice(0,10);
 const totals=inputs.flatMap(row=>row.input&&row.input.kind!=='rate'&&row.input.fromDate===scope.fromDate&&row.input.toDate===until?[row]:[]);
 const currencies=[...new Set(totals.map(row=>row.input!.currency))];
 const currency=currencies.length===1?currencies[0]:null;
 const one=(kind:string)=>{const rows=totals.filter(row=>row.input!.kind===kind);return rows.length===1&&currency?String((rows[0].input as {minorUnits:string}).minorUnits):null;};
 // A per-resource rate is not a blended EAC rate. Never manufacture one from allocations.
 const values=wholeEngagementBasis(effort);
 const periodFinancials={period:{fromDate:scope.fromDate,toDate:until,endExclusive:true},currency,fee:one('contracted_revenue'),nonlabor:one('nonlabor'),wholeEngagementBasis:false};
 return {status:'available' as const,currency:null,exponent:null,periodFinancials,inputs:totals,values,metrics:engagementMetrics(values),notice:'Period fee and nonlabor observations are separate from whole-engagement lifetime EAC. No reviewed whole-contract fee, nonlabor total or uniform blended rate is established. A what-if requires explicit whole-engagement financial and currency assumptions; it changes no approved finance or staffing.'};
}
async function engagementSnapshot(db:PoolClient,actor:CurrentSession,input:z.infer<typeof engagementInputSchema>,fence=false){
 const dates=period(input),engagement=await readEngagement(actor,input.engagementId,db);
 const initialized=(await db.query('SELECT 1 FROM execution_workspaces WHERE engagement_id=$1',[input.engagementId])).rowCount;
 if(!initialized)return {synthetic:false,engagement,proposals:[],summary:null,records:[],finance:await economics(db,actor,engagement,dates,{actualLifetimeMinutes:null,remainingMinutes:null}),asOf:new Date().toISOString(),dataVersion:`${engagement.activeBaselineId}:uninitialized`,unavailableReason:'execution_not_initialized'};
 const selected=await selectExecutionSummarySnapshot(db,actor,input.engagementId,{from:dates.fromDate,to:dates.toDate},true);
 const proposals=[];let cursor:string|undefined;
 do{const page=await readExecutionRecords(actor,input.engagementId,{kind:'scope_change',limit:50,...(cursor?{cursor}:{})},false,db,true,!fence);
  proposals.push(...page.records.filter(r=>{const parsed=executionRecordSchema.safeParse(r.content);return !r.reviewRequired&&parsed.success&&parsed.data.kind==='scope_change'&&parsed.data.state==='proposed';}));
  cursor=page.nextCursor??undefined;if(proposals.length>200)throw new HttpFailure(422,'scope_too_large','Narrow proposed interventions');
 }while(cursor);
 const finance=await economics(db,actor,engagement,dates,selected.summary.effort);
 return {synthetic:false,engagement,proposals,summary:{...selected.summary,receipt:{...selected.summary.receipt,inputDigest:operationsReadDigest(selected.inputs)}},records:selected.records.filter(r=>r.content&&!r.reviewRequired),finance,asOf:selected.summary.asOf,dataVersion:`${engagement.activeBaselineId}:${selected.summary.generation}`};
}
export async function readOperationsEngagement(actor:CurrentSession,raw:unknown,existingClient?:PoolClient){const input=engagementInputSchema.parse(raw);period(input);return existingClient?engagementSnapshot(existingClient,actor,input):withTransaction(db=>engagementSnapshot(db,actor,input));}
export async function ordinaryEngagement(db:PoolClient,principal:Principal,input:z.infer<typeof engagementInputSchema>){
 const scope=await ordinaryActor(db,principal);
 if(!scope.general){const row=(await db.query('SELECT customer_id FROM engagements WHERE id=$1 AND workspace_id=$2',[input.engagementId,scope.actor.workspaceId])).rows[0];if(row?.customer_id!==scope.customerId)throw hiddenRecord();}
 const canonicalInput={engagementId:input.engagementId,...period(input)};const result=await readOperationsEngagement(scope.actor,canonicalInput,db);await registerOperationsRead(db,scope,'engagement',canonicalInput,result,[result.engagement.customerId]);return result;
}
export async function readOrdinaryEngagement(principal:Principal,raw:unknown){const input=engagementInputSchema.parse(raw);period(input);return withTransaction(db=>ordinaryEngagement(db,principal,input));}
export const scenarioInputSchema=z.object({...engagementInputSchema.shape,remainingHours:z.number().finite().min(0).max(100000).optional(),wholeEngagementFeeMinorUnits:z.string().regex(/^(0|[1-9][0-9]*)$/).max(13).optional(),wholeEngagementNonlaborMinorUnits:z.string().regex(/^(0|[1-9][0-9]*)$/).max(13).optional(),wholeEngagementLoadedRateMinorUnitsPerHour:z.string().regex(/^(0|[1-9][0-9]*)$/).max(9).optional(),currency:staffingCurrencySchema.optional()}).strict();
export async function calculateOrdinaryScenario(principal:Principal,raw:unknown){
 const input=scenarioInputSchema.parse(raw);period(input);
 return withTransaction(async db=>{
  const brief=await ordinaryEngagement(db,principal,input);
  if(brief.finance.status!=='available')throw new HttpFailure(403,'forbidden','Finance access required');
  const scenario=wholeEngagementScenario(brief.finance.values,input);
  return {synthetic:false,hypothetical:true,planningOnly:true,financialBasis:'explicit_whole_engagement_assumptions',currency:scenario.currency,baseline:brief.finance.metrics,periodFinancials:brief.finance.periodFinancials,metrics:scenario.metrics,assumptions:scenario.values,dataVersion:brief.dataVersion,notice:'Remaining effort replaces the whole-engagement remainder. Financial overrides are explicitly hypothetical whole-engagement totals and one uniform rate; period observations are not used in lifetime contribution. No record, allocation, quote or forecast was changed.'};
 });
}
async function portfolioSnapshot(db:PoolClient,actor:CurrentSession,input:z.infer<typeof periodSchema>,customerId?:string,fence=false){
 await lockWorkspaceActor(db,actor,undefined,true);
  const rows=(await db.query(`SELECT e.id FROM engagements e JOIN delivery_plans p ON p.id=e.plan_id WHERE e.environment_id=$1 AND e.workspace_id=$2 AND p.accepted_revision_id IS NOT NULL
   AND ($3::uuid IS NULL OR e.customer_id=$3) AND ($4='internal' OR (e.audience='delivery' AND EXISTS(SELECT 1 FROM customer_grants g WHERE g.customer_id=e.customer_id AND g.membership_id=$5 AND g.state='active'))) ORDER BY e.id LIMIT 201`,[getServerConfig().TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId??null,actor.kind,actor.membershipId])).rows;
  if(rows.length>200)throw new HttpFailure(422,'scope_too_large','Narrow the portfolio');
  const engagements=[];
  for(const row of rows)engagements.push(await engagementSnapshot(db,actor,{engagementId:row.id,...input},fence));
  return {synthetic:false,asOf:new Date().toISOString(),period:input,engagements,exceptions:engagements.filter(e=>!e.summary||e.summary.reviewRequired||e.summary.status.blockers.length||e.summary.status.unknownDates.length||e.finance.status==='available'&&e.finance.metrics.status==='unknown').map(e=>({engagementId:e.engagement.engagementId,status:e.summary?.status??null,financeStatus:e.finance.status})),...portfolioMetrics(engagements.map(e=>e.finance.status==='available'?{currency:e.finance.currency,fee:e.finance.values.fee,contribution:e.finance.metrics.contribution}:{currency:null,fee:null,contribution:null})),periodFinancials:portfolioMetrics(engagements.map(e=>e.finance.status==='available'?{currency:e.finance.periodFinancials.currency,fee:e.finance.periodFinancials.fee,contribution:null}:{currency:null,fee:null,contribution:null})),notice:'Unknown or unauthorized economics are not zero. Currency-scoped complete engagement economics are required before portfolio revenue/contribution can be aggregated.'};
}
export async function readOperationsPortfolio(actor:CurrentSession,raw:unknown){const input=periodSchema.parse(raw);return withTransaction(db=>portfolioSnapshot(db,actor,input));}
export async function readOrdinaryPortfolio(principal:Principal,raw:unknown){const input=periodSchema.parse(raw);return withTransaction(async db=>{const scope=await ordinaryActor(db,principal);const result=await portfolioSnapshot(db,scope.actor,input,scope.general?undefined:scope.customerId);await registerOperationsRead(db,scope,'portfolio',{...input,...(!scope.general?{customerId:scope.customerId}:{})},result,result.engagements.map(e=>e.engagement.customerId));return result;});}

export async function readOperationsSnapshot(db:PoolClient,actor:CurrentSession,kind:OperationsReadKind,raw:unknown){if(kind==='engagement')return engagementSnapshot(db,actor,engagementInputSchema.parse(raw),true);if(kind==='capacity')return capacitySnapshot(db,actor,periodSchema.parse(raw));if(kind==='portfolio'){const input=z.object({...periodSchema.shape,customerId:z.uuid().optional()}).strict().parse(raw);period(input);return portfolioSnapshot(db,actor,input,input.customerId,true);}throw hiddenRecord();}
