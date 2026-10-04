import type {PoolClient} from 'pg';
import {Temporal} from '@js-temporal/polyfill';
import {HttpFailure} from '../../contracts/http';
import {reportSelectionSchema} from './schema';
import {validateReportPeriod} from '../../reports/periods';
import {validateReportSelection,selectReportDeliveryRecords} from './projection';
import {reportSourceClosure,verifyReportSources,type ReportSource,type ReportSourceScope} from './sources';
import {selectReportCalculationInputs} from './calculation-inputs';
import {reportDigest} from './commands';
import {selectReportProfileInputs} from './profile-inputs';
import {reportEligibleInputDigest} from './freshness';
import {reportMeasurementInputs} from './measurements';
import {selectReportMilestones} from './milestones';
/** Caller holds live interactive or persisted job authority and a repeatable transaction. */
export async function captureReportSnapshot(db:PoolClient,scope:ReportSourceScope,selection:ReturnType<typeof reportSelectionSchema.parse>,fromDate:string,toDate:string,partial:boolean){
 const asOf=(await db.query("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS instant")).rows[0].instant;
 const period=validateReportPeriod(selection.kind,fromDate,toDate,selection.timezone,partial,asOf);
 const scopedSelection=await validateReportSelection(db,scope,selection);
 const customer=(await db.query('SELECT synthetic FROM customer_references WHERE id=$1 AND workspace_id=$2',[scope.customerId,scope.workspaceId])).rows[0];
 const cutoffDate=Temporal.Instant.from(asOf).toZonedDateTimeISO(selection.timezone).toPlainDate().toString();
 const profiles=await selectReportProfileInputs(db,scope,selection,asOf);
 const selected=await selectReportDeliveryRecords(db,scope,selection.engagementIds);
 const milestones=await selectReportMilestones(db,scope,selection.engagementIds);
 const engagements=(await db.query(`SELECT e.id,e.active_baseline_id,e.workload_id,b.content_digest,b.baseline_number,b.decision_id,x.generation,x.state,x.version
 FROM engagements e JOIN milestone_baselines b ON b.id=e.active_baseline_id LEFT JOIN execution_workspaces x ON x.engagement_id=e.id
  WHERE e.id=ANY($1::uuid[]) AND e.environment_id=$2 AND e.workspace_id=$3 AND e.customer_id=$4 ORDER BY e.id FOR SHARE OF e`,[selection.engagementIds,scope.environmentId,scope.workspaceId,scope.customerId])).rows;
 if(engagements.length!==selection.engagementIds.length)throw new HttpFailure(409,'source_changed','Engagement baseline unavailable');
 const baselineRefs:ReportSource[]=engagements.map(row=>({kind:'milestone_baseline',id:row.active_baseline_id,revisionId:row.active_baseline_id,generation:Number(row.baseline_number),contentDigest:row.content_digest,engagementId:row.id,decisionId:row.decision_id}));
 const baselines=await reportSourceClosure(db,scope,baselineRefs);await verifyReportSources(db,scope,baselines);
 const calculations=[];for(const row of engagements)calculations.push({engagementId:row.id,...await selectReportCalculationInputs(db,scope,row.id,row.active_baseline_id,{fromDate,toDate,cutoffDate},selected.records.filter(record=>record.engagementId===row.id))});
 if(profiles.inputs.length+selected.records.length>1000)throw new HttpFailure(422,'scope_too_large','Narrow the combined report input scope');
 const dependencies=[...new Map([...milestones.sources,...profiles.sources,...scopedSelection.sources,...selected.sources,...baselines,...calculations.flatMap(calculation=>calculation.sources)].map(ref=>[`${ref.kind}:${ref.revisionId}`,ref])).values()].sort((a,b)=>a.kind.localeCompare(b.kind)||a.revisionId.localeCompare(b.revisionId));
 if(dependencies.length>2000)throw new HttpFailure(422,'scope_too_large','Narrow the exact report source scope');
 const relevant=selected.records.filter(record=>record.eventDate<=cutoffDate && (record.eventDate>=fromDate && record.eventDate<=toDate || ['raid','decision','scope_change','effort_budget','estimate','handoff','closeout','outcome'].includes(record.kind) || record.content.subtype==='milestone_plan'));
 const generationWatches=[{kind:'eligible_inputs',digest:reportEligibleInputDigest([...milestones.sources,...profiles.sources,...selected.sources,...calculations.flatMap(calculation=>calculation.sources)],calculations)}];
 return {selection,period,asOf,cutoffDate,synthetic:customer.synthetic,engagements:engagements.map(row=>({id:row.id,baselineId:row.active_baseline_id,workloadId:row.workload_id,state:row.state??'not_initialized'})),
 profiles:profiles.inputs,milestones:milestones.milestones,records:relevant,dependencies,calculations,measurements:reportMeasurementInputs(relevant,cutoffDate),generationWatches,coverage:{...selected.coverage,reviewRequiredRecords:selected.coverage.reviewRequiredRecords+profiles.reviewRequired+milestones.reviewRequired,includedRecords:relevant.length},sourceSetDigest:reportDigest(dependencies)};
}
