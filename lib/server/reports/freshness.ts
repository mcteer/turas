import type {PoolClient} from 'pg';
import {Temporal} from '@js-temporal/polyfill';
import {reportDigest} from './commands';
import {selectReportDeliveryRecords} from './projection';
import {selectReportProfileInputs} from './profile-inputs';
import {selectReportCalculationInputs} from './calculation-inputs';
import type {ReportSource,ReportSourceScope} from './sources';
import {selectReportMilestones} from './milestones';

/** Hidden and pending inputs must not change a report's visible freshness state. */
export function reportEligibleInputDigest(sources:ReportSource[],calculations:Array<{engagementId:string;results:unknown}>){
 const ordered=[...new Map(sources.map(source=>[`${source.kind}:${source.revisionId}`,source])).values()]
  .sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
 return reportDigest({sources:ordered,calculations:calculations.map(({engagementId,results})=>({engagementId,results})).sort((a,b)=>a.engagementId.localeCompare(b.engagementId))});
}
export async function currentReportEligibleInputDigest(db:PoolClient,scope:ReportSourceScope,selection:{engagementIds:string[];workloadIds:string[];includeCustomerLevel:boolean;timezone:string},period:{fromDate:string;toDate:string}){
 const asOf=(await db.query('SELECT clock_timestamp() AS instant')).rows[0].instant.toISOString();
 const cutoffDate=Temporal.Instant.from(asOf).toZonedDateTimeISO(selection.timezone).toPlainDate().toString();
 const records=await selectReportDeliveryRecords(db,scope,selection.engagementIds);
 const profiles=await selectReportProfileInputs(db,scope,selection,asOf);
 const milestones=await selectReportMilestones(db,scope,selection.engagementIds);
 const baselines=(await db.query(`SELECT id,active_baseline_id FROM engagements WHERE id=ANY($1::uuid[]) AND environment_id=$2 AND workspace_id=$3 AND customer_id=$4 ORDER BY id FOR SHARE`,[selection.engagementIds,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 const calculations=[];
 for(const row of baselines)calculations.push({engagementId:row.id,...await selectReportCalculationInputs(db,scope,row.id,row.active_baseline_id,{...period,cutoffDate},records.records.filter(record=>record.engagementId===row.id))});
 return reportEligibleInputDigest([...milestones.sources,...profiles.sources,...records.sources,...calculations.flatMap(calculation=>calculation.sources)],calculations);
}
