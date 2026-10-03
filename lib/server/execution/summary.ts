import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {PoolClient} from "pg";
import {HttpFailure,hiddenRecord} from "../../contracts/http";
import {calculateActualUtilization,EXECUTION_EFFORT_VERSION,type UtilizationDay} from "../../execution/calculations";
import {availabilityFreshness} from "../../staffing/freshness";
import {lockStaffingActor} from "../staffing/policy";
import {lockResourceHeads} from "../staffing/resources";
import {readMatchingCalendars} from "../staffing/calendar-inputs";
import {executionTransaction,executionDigest} from "./commands";
import {executionCustomer,chargeExecutionRate} from "./locks";
import {lockExecutionActor,requireExecutionCapability,type ExecutionActor} from "./policy";
import {requireExecutionEnvironment} from "./repository";
import {executionPeriodSchema,executionId,executionRecordSchema,type ExecutionSource} from "./schema";
import {executionStoredReferences,executionRevisionEligible,lockExecutionOriginalSources} from "./sources";
import {selectExecutionEffort,type AcceptedExecutionRecord} from "./calculations";
import {readExecutionOverviewSnapshot} from "./service";

/** All prose is selected after live authority, from accepted heads, and released
 * only after the complete source union and current aggregate have been fenced. */
export async function readExecutionSummary(actor:ExecutionActor,engagementId:string,raw:unknown){
  const parsed=executionPeriodSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(400,"invalid_input","Invalid execution period");
  const period=parsed.data;
  // A durable admission commits before the repeatable snapshot. Waiting on the
  // shared rate row after a plan/source lock inverted ordinary read/write order.
  await executionTransaction(async db=>{const customerId=await executionCustomer(db,actor,engagementId);
    await lockExecutionActor(db,actor,customerId,"read");await chargeExecutionRate(db,actor,"read");});
  return executionTransaction(async db=>{
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    const customerId=await executionCustomer(db,actor,engagementId);await lockExecutionActor(db,actor,customerId,"read");
    const selected=(await db.query(`SELECT r.id,r.kind,r.baseline_id,v.id AS revision_id,v.content_digest,v.revision_number
      FROM execution_records r JOIN execution_record_revisions v ON v.id=r.accepted_revision_id
      WHERE r.engagement_id=$1 AND (v.audience='delivery' OR $2='internal') ORDER BY r.id LIMIT 201`,[engagementId,actor.kind])).rows;
    if(selected.length>200)throw new HttpFailure(422,"scope_too_large","Narrow the reviewed execution snapshot");
    const baseline=(await db.query("SELECT active_baseline_id FROM engagements WHERE id=$1",[engagementId])).rows[0]?.active_baseline_id;
    const baselines=(await db.query("SELECT id,plan_id,baseline_number,content_digest FROM milestone_baselines WHERE engagement_id=$1 AND (id=$2 OR id=ANY($3::uuid[])) ORDER BY id",[engagementId,baseline,[...new Set(selected.map(r=>r.baseline_id))]])).rows;
    await db.query("SELECT id FROM delivery_plans WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE",[[...new Set(baselines.map(b=>b.plan_id))].sort()]);
    const references:ExecutionSource[]=[...selected.map(r=>({kind:"execution_record" as const,id:r.id,sourceRevisionId:r.revision_id,generation:Number(r.revision_number),contentDigest:r.content_digest})),
      ...baselines.map(b=>({kind:"milestone_baseline" as const,id:b.id,sourceRevisionId:b.id,generation:Number(b.baseline_number),contentDigest:b.content_digest}))];
    await lockExecutionOriginalSources(db,actor,customerId,engagementId,references);
    const view=await readExecutionOverviewSnapshot(db,actor,engagementId,customerId);if(!view.initialized)throw hiddenRecord();
    const asOf=new Date().toISOString(),records:AcceptedExecutionRecord[]=[];
    for(const r of selected){
      const eligible=await executionRevisionEligible(db,actor,customerId,engagementId,r.revision_id,actor.kind==="partner"?"delivery":"internal",false);
      const payload=eligible?(await db.query("SELECT content FROM execution_record_payloads WHERE revision_id=$1",[r.revision_id])).rows[0]?.content:null;
      const content=payload?executionRecordSchema.parse(payload):null;
      records.push({id:r.id,revisionId:r.revision_id,baselineId:r.baseline_id,kind:r.kind,contentDigest:r.content_digest,content,reviewRequired:!eligible||r.baseline_id!==view.baselineId});
    }
    const selectedEffort=await selectExecutionEffort(db,actor,engagementId,view.baselineId,period,asOf,!view.reviewRequired,records);
    const counts:Record<string,number>={not_started:0,in_progress:0,blocked:0,ready_for_review:0,accepted:0,waived:0,review_required:0};
    for(const milestone of view.milestones)counts[milestone.state]++;
    const today=asOf.slice(0,10),blockers:Array<{id:string;title:string;severity:string;reviewDate:string|null;unknownDateReason:string|null}>=[],overdue:Array<{kind:string;key:string;title:string;date:string}>=[],unknownDates:Array<{kind:string;key:string;reason:string}>=[];
    for(const m of view.milestones){if(!m.plannedDate)unknownDates.push({kind:"milestone",key:m.key,reason:m.unknownPlannedDateReason??"Date unknown"});else if(m.plannedDate<today&&!["accepted","waived"].includes(m.state))overdue.push({kind:"milestone",key:m.key,title:m.title,date:m.plannedDate});}
    const eligibleRecords=records.filter(r=>r.content&&!r.reviewRequired);
    for(const row of eligibleRecords){const r=row.content!;if(r.kind!=="raid")continue;
      if(["issue","dependency"].includes(r.raidType)&&["high","critical"].includes(r.severity)&&["open","monitoring"].includes(r.status))blockers.push({id:row.id,title:r.title,severity:r.severity,reviewDate:r.reviewDate,unknownDateReason:r.unknownDateReason});
      if(!r.reviewDate)unknownDates.push({kind:"raid",key:row.id,reason:r.unknownDateReason??"Review date unknown"});else if(r.reviewDate<today&&["open","monitoring"].includes(r.status))overdue.push({kind:"raid",key:row.id,title:r.title,date:r.reviewDate});
    }
    const activities=eligibleRecords.filter(r=>r.kind==="activity").sort((a,b)=>b.content!.eventDate.localeCompare(a.content!.eventDate)||a.id.localeCompare(b.id));
    const sources=new Map<string,ExecutionSource>();
    for(const record of eligibleRecords)for(const ref of await executionStoredReferences(db,record.revisionId,record.content!))sources.set(`${ref.kind}/${ref.sourceRevisionId}`,ref);
    if(sources.size>200)throw new HttpFailure(422,"scope_too_large","Narrow the evidence age snapshot");
    const evidenceAge=[];
    for(const ref of sources.values()){const observed=await observationDate(db,ref);evidenceAge.push({kind:ref.kind,sourceRevisionId:ref.sourceRevisionId,observationDate:observed,ageDays:observed&&observed<=today?(Date.parse(today)-Date.parse(observed))/86400000:null});}
    const inputDigest=executionDigest({engagementId,baselineId:view.baselineId,generation:view.generation,asOf,period,records:records.map(r=>({id:r.id,revisionId:r.revisionId,contentDigest:r.contentDigest,reviewRequired:r.reviewRequired})),effort:selectedEffort.inputs,milestones:view.milestones.map(m=>({id:m.id,version:m.version,state:m.state}))});
    const id=randomUUID();await db.query(`INSERT INTO execution_calculation_receipts(id,environment_id,workspace_id,customer_id,engagement_id,generation,formula_version,input_digest,from_date,to_date,as_of,actor_membership_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,customerId,engagementId,view.generation,EXECUTION_EFFORT_VERSION,inputDigest,period.from,period.to,asOf,actor.membershipId]);
    const provenance=view.reviewRequired?null:(await db.query("SELECT content->'workPackages' AS packages FROM milestone_baseline_payloads WHERE baseline_id=$1",[view.baselineId])).rows[0]?.packages;
    return {engagementId,baselineId:view.baselineId,generation:view.generation,asOf,period,state:view.state,reviewRequired:view.reviewRequired,
      receipt:{id,inputDigest,formulaVersion:EXECUTION_EFFORT_VERSION,generation:view.generation},effort:selectedEffort.effort,
      planEffortProvenance:(provenance??[]).map((p:{key:string;effort:unknown})=>({key:p.key,effort:p.effort})),
      status:{milestoneCounts:counts,blockers,overdue,unknownDates,latestActivity:activities[0]?{id:activities[0].id,title:activities[0].content!.title,eventDate:activities[0].content!.eventDate}:null,evidenceAge,
        reviewRequiredRecords:records.filter(r=>r.reviewRequired).length}};
  });
}
async function observationDate(db:PoolClient,ref:ExecutionSource):Promise<string|null>{
  let result:unknown=null;
  if(ref.kind==="execution_record")result=(await db.query("SELECT event_date::text AS date FROM execution_record_revisions WHERE id=$1",[ref.sourceRevisionId])).rows[0]?.date;
  if(ref.kind==="accepted_profile"){
    // Profile commands persist the reviewed observation in the versioned
    // payload. The legacy optional header column is not populated by intake.
    const observed=(await db.query("SELECT COALESCE(payload->>'observedAt',payload->>'observationEnd') AS observed FROM profile_revisions WHERE id=$1",[ref.sourceRevisionId])).rows[0]?.observed;
    result=typeof observed==="string"&&Number.isFinite(Date.parse(observed))?new Date(observed).toISOString().slice(0,10):null;
  }
  if(ref.kind==="approved_excerpt")result=(await db.query(`SELECT v.source_observed_on::text AS date FROM artifact_evidence_selections s
    JOIN artifact_versions v ON v.id=s.version_id WHERE s.id=$1`,[ref.sourceRevisionId])).rows[0]?.date;
  if(ref.kind==="verified_research")result=(await db.query("SELECT (observation_at AT TIME ZONE 'UTC')::date::text AS date FROM evidence_source_revisions WHERE id=$1",[ref.sourceRevisionId])).rows[0]?.date;
  // Publication, upload and review timestamps are not observation dates.
  return typeof result==="string"?result:null;
}
const utilizationSchema=z.object({resourceIds:z.array(executionId).min(1).max(50).refine(ids=>new Set(ids).size===ids.length),from:z.string(),to:z.string()}).strict()
  .refine(p=>executionPeriodSchema.safeParse({from:p.from,to:p.to}).success);
export async function readExecutionUtilization(actor:ExecutionActor,raw:unknown){
  requireExecutionCapability(actor,"utilization");const parsed=utilizationSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(400,"invalid_input","Invalid utilization scope");
  const input=parsed.data,ids=[...input.resourceIds].sort();
  await executionTransaction(async db=>{await lockStaffingActor(db,actor,"manager");await requireExecutionEnvironment(db);await chargeExecutionRate(db,actor,"read");});
  return executionTransaction(async db=>{
    await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");await lockStaffingActor(db,actor,"manager");await requireExecutionEnvironment(db);
    const resources=await lockResourceHeads(db,actor,ids,"SHARE"),asOf=new Date().toISOString();
    await db.query("SELECT id FROM resource_calendars WHERE resource_id=ANY($1::uuid[]) ORDER BY resource_id FOR SHARE",[ids]);
    const calendars=await readMatchingCalendars(db,actor,ids,{fromDate:input.from,toDate:input.to},[],"none");
    const profiles=(await db.query("SELECT revision_id,display_name,timezone FROM workforce_resource_payloads WHERE revision_id=ANY($1::uuid[]) FOR SHARE",[resources.map(r=>r.current_revision_id)])).rows;
    const calendarPayloads=(await db.query("SELECT revision_id FROM resource_calendar_payloads WHERE revision_id=ANY($1::uuid[]) FOR SHARE",[[...new Set([...calendars.values()].flat().flatMap(d=>d.revisionId?[d.revisionId]:[]))]])).rows;
    const actuals=(await db.query(`SELECT d.resource_id,d.service_date::text,SUM(CASE WHEN d.billable THEN d.minutes ELSE 0 END)::text AS minutes,
      array_agg(DISTINCT v.timezone) FILTER(WHERE d.minutes>0) AS zones FROM execution_actual_days d JOIN execution_time_revisions v ON v.id=d.revision_id
      WHERE d.environment_id=$1 AND d.workspace_id=$2 AND d.resource_id=ANY($3::uuid[]) AND d.service_date BETWEEN $4 AND $5 GROUP BY d.resource_id,d.service_date`,
      [process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId,ids,input.from,input.to])).rows;
    const all:UtilizationDay[]=[];
    const output=resources.map(resource=>{const profile=profiles.find(p=>p.revision_id===resource.current_revision_id);
      const days=(calendars.get(resource.id)??[]).map(d=>{const actual=actuals.find(a=>a.resource_id===resource.id&&a.service_date===d.date);
        const mismatch=d.timezone&&(actual?.zones?.some((zone:string)=>zone!==d.timezone)??false);
        const reason=mismatch?"timezone_mismatch":!resource.active||!profile?"resource_unavailable":!d.revisionId||!calendarPayloads.some(p=>p.revision_id===d.revisionId)?"missing_calendar":profile.timezone!==d.timezone?"timezone_mismatch":
          !availabilityFreshness({observedAt:d.observedAt,nextReviewAt:d.nextReviewAt},asOf).validThrough?"calendar_review_required":null;
        return {resourceId:resource.id,date:d.date,actualBillableMinutes:actual?.minutes??"0",availableMinutes:d.availableMinutes,reason};});
      all.push(...days);return {resourceId:resource.id,label:profile?.display_name??"Unavailable resource",...calculateActualUtilization(days)};
    });
    return {asOf,period:{from:input.from,to:input.to},formulaVersion:EXECUTION_EFFORT_VERSION,resources:output,total:calculateActualUtilization(all),
      inputDigest:executionDigest({ids,period:{from:input.from,to:input.to},asOf,resourceVersions:resources.map(r=>({id:r.id,version:r.aggregate_version})),calendars:[...calendars],actuals})};
  });
}
