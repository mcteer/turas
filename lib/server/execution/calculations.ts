import type {PoolClient} from "pg";
import {HttpFailure} from "../../contracts/http";
import {calculateExecutionEffort,type EffortInput} from "../../execution/calculations";
import type {ExecutionActor} from "./policy";
import type {ExecutionRecordContent} from "./schema";
import {mapExecutionItem} from "./reconciliation";
export type AcceptedExecutionRecord={id:string;revisionId:string;baselineId:string;kind:string;contentDigest:string;content:ExecutionRecordContent|null;reviewRequired:boolean};
/** Caller holds a repeatable, authorized engagement snapshot and original-source
 * fences. Only the current contribution ledger supplies quantities. */
export async function selectExecutionEffort(db:PoolClient,actor:ExecutionActor,engagementId:string,baselineId:string,period:{from:string;to:string},asOf:string,
  baselineCurrent:boolean,records:AcceptedExecutionRecord[]){
  const keys=(await db.query<{item_key:string}>("SELECT item_key FROM execution_baseline_items WHERE engagement_id=$1 AND baseline_id=$2 AND item_kind='work_package' ORDER BY item_key",[engagementId,baselineId])).rows;
  const actuals=(await db.query(`SELECT baseline_id,work_package_key,service_date::text,billable,SUM(minutes)::text AS minutes
    FROM execution_actual_days WHERE engagement_id=$1 GROUP BY baseline_id,work_package_key,service_date,billable ORDER BY baseline_id,work_package_key,service_date,billable LIMIT 10001`,[engagementId])).rows;
  if(actuals.length>10000)throw new HttpFailure(422,"scope_too_large","Narrow the lifetime effort snapshot");
  const mappings=new Map<string,Awaited<ReturnType<typeof mapExecutionItem>>>();
  async function mapping(baseline:string,key:string){const id=`${baseline}/${key}`;let result=mappings.get(id);if(!result){result=await mapExecutionItem(db,actor,engagementId,baseline,baselineId,"work_package",key);mappings.set(id,result);}return result;}
  const counted:EffortInput["actuals"][number][]=[];
  for(const row of actuals){const mapped=await mapping(row.baseline_id,row.work_package_key);counted.push({minutes:row.minutes,date:row.service_date,billable:row.billable,mappedKey:mapped.key,disposition:mapped.state});}
  // pg's Date decoder discards microseconds. Preserve the database precision so
  // a mutation immediately after the estimate still invalidates that estimate.
  const mutations=(await db.query(`SELECT baseline_id,work_package_key,generation,
    to_char(changed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at
    FROM execution_actual_package_heads WHERE engagement_id=$1 ORDER BY baseline_id,work_package_key`,[engagementId])).rows;
  if(mutations.length>10000)throw new HttpFailure(422,"scope_too_large","Narrow the effort mutation history");
  const lastMutations=new Map<string,string>();
  for(const mutation of mutations){const mapped=await mapping(mutation.baseline_id,mutation.work_package_key);if(mapped.key){const at=mutation.changed_at;if(at>(lastMutations.get(mapped.key)??""))lastMutations.set(mapped.key,at);}}
  const heads=(await db.query("SELECT id,kind,work_package_key,revision_id,version FROM execution_effort_heads WHERE engagement_id=$1 AND baseline_id=$2 ORDER BY work_package_key,kind",[engagementId,baselineId])).rows;
  const reconciled=(await db.query(`SELECT to_char(MAX(created_at) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at
    FROM execution_reconciliations WHERE engagement_id=$1 AND new_baseline_id=$2`,[engagementId,baselineId])).rows[0].at;
  const packages=keys.map(({item_key:key})=>{
    const content=(kind:string)=>{const head=heads.find(h=>h.work_package_key===key&&h.kind===kind);return records.find(r=>r.revisionId===head?.revision_id&&!r.reviewRequired)?.content;};
    const budget=content("effort_budget"),estimate=content("estimate");
    return {key,budgetMinutes:budget?.kind==="effort_budget"?budget.minutes:null,estimate:estimate?.kind==="estimate"?{minutes:estimate.minutes,asOf:estimate.asOf,explicitZero:estimate.explicitZero}:null,lastActualMutationAt:lastMutations.get(key)??null};
  });
  const result=calculateExecutionEffort({asOf,period,baselineCurrent,reconciledAt:reconciled,packages,actuals:counted});
  // A confirmed commitment remains a planned quantity. Availability/competency
  // concerns do not convert it into actual effort or increase the forecast.
  const planned=(await db.query(`SELECT COALESCE(SUM(day.minutes),0)::text AS minutes,
    COALESCE(bool_or(d.current_revision_id<>v.demand_revision_id OR d.state<>'qualified' OR r.baseline_id<>$2),false) AS review_required,
    COALESCE(string_agg(day.revision_id::text||'/'||day.service_date::text||'/'||day.minutes::text,'|' ORDER BY day.allocation_id,day.service_date),'') AS identity
    FROM staffing_allocation_days day JOIN staffing_allocations a ON a.id=day.allocation_id AND a.state='confirmed' AND a.confirmed_revision_id=day.revision_id
    JOIN staffing_allocation_revisions v ON v.id=day.revision_id JOIN staffing_demand_revisions r ON r.id=v.demand_revision_id JOIN staffing_demands d ON d.id=v.demand_id
    WHERE r.engagement_id=$1 AND day.service_date BETWEEN $3 AND $4`,[engagementId,baselineId,period.from,period.to])).rows[0];
  const tentative=(await db.query(`SELECT COALESCE(SUM((day->>'minutes')::integer),0)::text AS minutes FROM staffing_allocations a
    JOIN staffing_allocation_revisions v ON v.id=a.current_revision_id JOIN staffing_demand_revisions r ON r.id=v.demand_revision_id
    JOIN staffing_allocation_payloads payload ON payload.revision_id=v.id CROSS JOIN LATERAL jsonb_array_elements(payload.content->'days') day
    WHERE r.engagement_id=$1 AND a.state='tentative' AND a.reservation_expires_at>clock_timestamp() AND (day->>'date')::date BETWEEN $2 AND $3`,[engagementId,period.from,period.to])).rows[0];
  const actualIdentity=(await db.query(`SELECT encode(sha256(convert_to(COALESCE(string_agg(entry_id::text||'/'||revision_id::text||'/'||decision_id::text||'/'||minutes::text,'|' ORDER BY entry_id),''),'UTF8')),'hex') AS digest
    FROM execution_actual_days WHERE engagement_id=$1`,[engagementId])).rows[0].digest;
  return {effort:{...result,plannedPeriodMinutes:planned.minutes,tentativePeriodMinutes:tentative.minutes,plannedReviewRequired:planned.review_required||!baselineCurrent},
    inputs:{heads,mutations,actualDigest:actualIdentity,plannedIdentity:planned.identity,tentativeMinutes:tentative.minutes,reconciledAt:reconciled}};
}
