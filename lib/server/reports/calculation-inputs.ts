import type {PoolClient} from 'pg';
import {HttpFailure} from '../../contracts/http';
import {calculateReportEffort} from '../../reports/calculations';
import {verifyReportSources,type ReportSource,type ReportSourceScope} from './sources';
import {reportDigest} from './commands';
import {Temporal} from '@js-temporal/polyfill';
export async function selectReportCalculationInputs(db:PoolClient,scope:ReportSourceScope,engagementId:string,baselineId:string,period:{fromDate:string;toDate:string;cutoffDate:string},records:Array<{revisionId:string;kind:string;content:Record<string,unknown>}>){
 const rows=(await db.query(`SELECT v.id AS revision_id,v.entry_id,v.revision_number,v.content_digest,v.service_date::text,a.minutes::text,a.decision_id,v.baseline_id,v.work_package_key
 FROM execution_actual_days a JOIN execution_time_revisions v ON v.id=a.revision_id JOIN execution_time_entries e ON e.approved_revision_id=v.id
 WHERE a.environment_id=$1 AND a.workspace_id=$2 AND a.customer_id=$3 AND a.engagement_id=$4 AND a.minutes>0 AND v.service_date<=$5
 ORDER BY v.id LIMIT 2001`,[scope.environmentId,scope.workspaceId,scope.customerId,engagementId,period.cutoffDate])).rows;
 if(rows.length>2000)throw new HttpFailure(422,'scope_too_large','Narrow the report actual contribution scope');
 const sources:ReportSource[]=rows.map(row=>({kind:'approved_time',id:row.entry_id,revisionId:row.revision_id,generation:Number(row.revision_number),contentDigest:row.content_digest,engagementId,decisionId:row.decision_id}));
 await verifyReportSources(db,scope,sources);
 const keys=(await db.query("SELECT item_key FROM execution_baseline_items WHERE baseline_id=$1 AND item_kind='work_package' ORDER BY item_key",[baselineId])).rows.map(row=>row.item_key);
 const heads=(await db.query('SELECT kind,work_package_key,revision_id FROM execution_effort_heads WHERE baseline_id=$1 AND engagement_id=$2 ORDER BY work_package_key,kind',[baselineId,engagementId])).rows;
 const mutations=(await db.query(`SELECT work_package_key,to_char(changed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS changed_at FROM execution_actual_package_heads WHERE baseline_id=$1 AND engagement_id=$2`,[baselineId,engagementId])).rows;
 let remaining=0n,budget=0n,remainingKnown=keys.length>0,budgetKnown=keys.length>0;
 for(const key of keys){
  const budgetHead=heads.find(row=>row.kind==='effort_budget' && row.work_package_key===key),estimateHead=heads.find(row=>row.kind==='estimate' && row.work_package_key===key);
  const budgetRecord=records.find(row=>row.revisionId===budgetHead?.revision_id)?.content,estimate=records.find(row=>row.revisionId===estimateHead?.revision_id)?.content;
  if(budgetRecord?.kind==='effort_budget' && typeof budgetRecord.minutes==='number')budget+=BigInt(budgetRecord.minutes);else budgetKnown=false;
  const changed=mutations.find(row=>row.work_package_key===key)?.changed_at;
  if(estimate?.kind==='estimate' && typeof estimate.minutes==='number' && typeof estimate.asOf==='string' && (!changed || Temporal.Instant.compare(estimate.asOf,changed)>=0))remaining+=BigInt(estimate.minutes);else remainingKnown=false;
 }
 const comparable=rows.every(row=>row.baseline_id===baselineId);
 const ledger=(await db.query('SELECT 1 FROM execution_workspaces WHERE engagement_id=$1 AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4',[engagementId,scope.environmentId,scope.workspaceId,scope.customerId])).rowCount;
 const input={...period,actualsKnown:Boolean(ledger),actuals:rows.map(row=>({revisionId:row.revision_id,serviceDate:row.service_date,minutes:row.minutes})),remainingMinutes:remainingKnown?remaining.toString():null,budgetMinutes:budgetKnown?budget.toString():null,comparable};
 return {input,results:calculateReportEffort(input),inputDigest:reportDigest({input,heads,mutations}),sources,timeDecisions:rows.map(row=>({entryId:row.entry_id,revisionId:row.revision_id,decisionId:row.decision_id,minutes:row.minutes}))};
}
