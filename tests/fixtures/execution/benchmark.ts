import {randomUUID,createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {withTransaction} from "../../../lib/server/db/client";
import {createExecutionBaseline} from "./baseline";
import {requireOwnedExecutionClone} from "../../../scripts/execution-eval-environment";
import {createResource} from "../../../lib/server/staffing/resources";
import {approveCalendar} from "../../../lib/server/staffing/calendars";
import {syntheticResource} from "../staffing/seed";
import {submitExecutionCommand} from "../../../lib/server/execution/service";
import {executionDigest} from "../../../lib/server/execution/commands";
import {executionRecordSchema} from "../../../lib/server/execution/schema";
import {timeInputSchema} from "../../../lib/server/execution/time-schema";
import type {ExecutionActor} from "../../../lib/server/execution/policy";
export const executionBenchmarkShape={engagements:1000,resources:500,timeRevisions:50000,recordRevisions:20000,decisions:10000,clients:5,warmups:10,samples:100} as const;
type Row=Record<string,unknown>;
// All identifiers below are authored constants, not command-line or user input.
async function bulk(db:PoolClient,table:string,rows:Row[]){
  if(!/^[a-z_]+$/.test(table))throw new Error("Invalid fixture table");
  for(let i=0;i<rows.length;i+=500){const batch=rows.slice(i,i+500),columns=Object.keys(batch[0]);
    if(columns.some(c=>!/^[a-z_]+$/.test(c)))throw new Error("Invalid fixture column");
    await db.query(`INSERT INTO ${table}(${columns.join(",")}) SELECT ${columns.join(",")} FROM jsonb_populate_recordset(NULL::${table},$1::jsonb)`,[JSON.stringify(batch)]);}
}
/** Bulk synthetic history is load only. The separate governed journey is the
 * approval evidence. Constraints, immutable triggers and production rates stay on. */
export async function seedExecutionBenchmark(){
  requireOwnedExecutionClone();
  const f=await withTransaction(db=>createExecutionBaseline(db));
  const actor=f.reviewer,users:ExecutionActor[]=[f.author,actor];
  const date=new Date(Date.now()-86400000).toISOString().slice(0,10),period={from:date,to:date};
  const resource=await createResource(actor,{requestKey:randomUUID(),rationale:"Synthetic representative benchmark resource",resource:{...syntheticResource(),timezone:"UTC",membershipId:f.author.membershipId}});
  await approveCalendar(actor,resource.resourceId,{requestKey:randomUUID(),rationale:"Synthetic reviewed historical capacity",calendar:{timezone:"UTC",observedAt:new Date(Date.now()-10000).toISOString(),nextReviewAt:new Date(Date.now()+86400000).toISOString(),fromDate:date,toDate:date,
    days:[{date,contracted:[{date,from:`${date}T09:00`,to:`${date}T17:00`,fromOffset:null,toOffset:null}],holidays:[],leave:[],protected:[]}]}});
  const setup=await submitExecutionCommand(f.author,f.engagementId,{version:"execution-v1",action:"setup",requestKey:randomUUID(),expectedVersions:{baseline:1,plan:f.decision.aggregateVersion},payload:{baselineId:f.baselineId}});
  const engagements=[{engagementId:f.engagementId,baselineId:f.baselineId,planId:f.created.planId}],resources=[resource.resourceId!];
  const receipts:Array<{actor:ExecutionActor;key:string;engagementId:string}>=[],candidates:Array<{engagementId:string;entryId:string;revisionId:string;contentDigest:string}>=[];
  await withTransaction(async db=>{
    for(let i=2;i<5;i++){
      const principalId=randomUUID(),membershipId=randomUUID(),sessionId=randomUUID(),loginName=`execution_benchmark_${i}_${randomUUID().slice(0,8)}`;
      await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic load contributor')",[principalId,loginName]);
      await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','member')",[membershipId,principalId,actor.workspaceId]);
      await db.query("INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '2 hours')",[sessionId,principalId,createHash("sha256").update(sessionId).digest("hex")]);
      users.push({...f.author,principalId,membershipId,sessionId,loginName,displayName:"Synthetic load contributor",expiresAt:new Date(Date.now()+7200000),token:"fixture"});
    }
    const row=async(table:string,where:string,value:string):Promise<Row>=>{const r=(await db.query(`SELECT * FROM ${table} WHERE ${where}=$1`,[value])).rows[0];if(!r)throw new Error("Benchmark template missing");return r;};
    const resourceHead=await row("workforce_resources","id",resource.resourceId!),resourceRevision=await row("workforce_resource_revisions","id",String(resourceHead.current_revision_id)),resourcePayload=await row("workforce_resource_payloads","revision_id",String(resourceHead.current_revision_id));
    const calendar=await row("resource_calendars","resource_id",resource.resourceId!),calendarRevision=await row("resource_calendar_revisions","calendar_id",String(calendar.id)),calendarPayload=await row("resource_calendar_payloads","revision_id",String(calendarRevision.id)),interval=await row("resource_calendar_intervals","revision_id",String(calendarRevision.id));
    const rr:Row[]=[],rh:Row[]=[],rp:Row[]=[],ch:Row[]=[],cr:Row[]=[],cp:Row[]=[],ci:Row[]=[],cd:Row[]=[];
    for(let i=1;i<500;i++){const id=randomUUID(),revisionId=randomUUID(),calendarId=randomUUID(),calendarRevisionId=randomUUID();resources.push(id);
      rh.push({...resourceHead,id,external_key:`benchmark_${i}`,membership_id:null,current_revision_id:null});
      rr.push({...resourceRevision,id:revisionId,resource_id:id});rp.push({...resourcePayload,revision_id:revisionId});
      ch.push({...calendar,id:calendarId,resource_id:id});cr.push({...calendarRevision,id:calendarRevisionId,calendar_id:calendarId,resource_id:id});
      cp.push({...calendarPayload,revision_id:calendarRevisionId});ci.push({...interval,id:randomUUID(),revision_id:calendarRevisionId,resource_id:id});
      cd.push({resource_id:id,service_date:date,revision_id:calendarRevisionId});
    }
    await bulk(db,"workforce_resources",rh);await bulk(db,"workforce_resource_revisions",rr);await bulk(db,"workforce_resource_payloads",rp);
    await db.query("UPDATE workforce_resources r SET current_revision_id=v.id FROM workforce_resource_revisions v WHERE v.resource_id=r.id AND r.current_revision_id IS NULL");
    for(const [table,rows] of [["resource_calendars",ch],["resource_calendar_revisions",cr],["resource_calendar_payloads",cp],["resource_calendar_intervals",ci],["resource_calendar_days",cd]] as const)await bulk(db,table,rows);
    const plan=await row("delivery_plans","id",f.created.planId),revision=await row("plan_revisions","id",f.created.revisionId),payload=await row("plan_revision_payloads","revision_id",f.created.revisionId),decision=await row("plan_decisions","id",f.decision.decisionId!),preview=await row("plan_review_previews","id",String(decision.preview_id)),decisionPayload=await row("plan_decision_payloads","decision_id",String(decision.id));
    const engagement=await row("engagements","id",f.engagementId),baseline=await row("milestone_baselines","id",f.baselineId),baselinePayload=await row("milestone_baseline_payloads","baseline_id",f.baselineId);
    const workspace=await row("execution_workspaces","engagement_id",f.engagementId),binding=await row("execution_baseline_bindings","engagement_id",f.engagementId),items=(await db.query("SELECT * FROM execution_baseline_items WHERE engagement_id=$1",[f.engagementId])).rows,milestones=(await db.query("SELECT * FROM execution_milestone_heads WHERE engagement_id=$1",[f.engagementId])).rows;
    const tables:Record<string,Row[]>={delivery_plans:[],plan_revisions:[],plan_revision_payloads:[],engagements:[],plan_review_previews:[],plan_decisions:[],plan_decision_payloads:[],milestone_baselines:[],milestone_baseline_payloads:[],execution_workspaces:[],execution_baseline_bindings:[],execution_baseline_items:[],execution_milestone_heads:[]};
    for(let i=1;i<1000;i++){
      const id=randomUUID(),planId=randomUUID(),revisionId=randomUUID(),baselineId=randomUUID(),decisionId=randomUUID(),previewId=randomUUID(),workspaceId=randomUUID(),bindingId=randomUUID();
      engagements.push({engagementId:id,baselineId,planId});
      tables.delivery_plans.push({...plan,id:planId,working_revision_id:null,accepted_revision_id:null,engagement_id:null});
      tables.plan_revisions.push({...revision,id:revisionId,plan_id:planId});tables.plan_revision_payloads.push({...payload,revision_id:revisionId});
      tables.engagements.push({...engagement,id,plan_id:planId,active_baseline_id:null});
      tables.plan_review_previews.push({...preview,id:previewId,plan_id:planId,revision_id:revisionId,used_decision_id:null});
      tables.plan_decisions.push({...decision,id:decisionId,plan_id:planId,revision_id:revisionId,preview_id:previewId,engagement_id:id,baseline_id:baselineId,request_key:randomUUID()});
      tables.plan_decision_payloads.push({...decisionPayload,decision_id:decisionId});
      tables.milestone_baselines.push({...baseline,id:baselineId,engagement_id:id,plan_id:planId,revision_id:revisionId,decision_id:decisionId});tables.milestone_baseline_payloads.push({...baselinePayload,baseline_id:baselineId});
      tables.execution_workspaces.push({...workspace,id:workspaceId,engagement_id:id,current_baseline_id:baselineId});
      tables.execution_baseline_bindings.push({...binding,id:bindingId,engagement_id:id,execution_id:workspaceId,baseline_id:baselineId});
      for(const item of items)tables.execution_baseline_items.push({...item,id:randomUUID(),engagement_id:id,binding_id:bindingId,baseline_id:baselineId});
      for(const m of milestones)tables.execution_milestone_heads.push({...m,id:randomUUID(),engagement_id:id,baseline_id:baselineId});
    }
    for(const [table,rows] of Object.entries(tables))await bulk(db,table,rows);
    await db.query("UPDATE engagements e SET active_baseline_id=b.id FROM milestone_baselines b WHERE b.engagement_id=e.id AND e.active_baseline_id IS NULL");
    await db.query("UPDATE delivery_plans p SET working_revision_id=b.revision_id,accepted_revision_id=b.revision_id,engagement_id=b.engagement_id FROM milestone_baselines b WHERE b.plan_id=p.id AND p.engagement_id IS NULL");
    const scope={environment_id:process.env.TURAS_ENVIRONMENT_ID,workspace_id:actor.workspaceId,customer_id:f.customerId};
    const baseRecord=executionRecordSchema.parse({kind:"activity",subtype:"work",title:"Synthetic representative delivery observation",narrative:"Synthetic load history; the governed journey supplies acceptance evidence.",audience:"delivery",eventDate:date,timezone:"UTC",workPackageKey:"proof",milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:"Owner not assigned",references:[]});
    const recordDigest=executionDigest(baseRecord),recordHeads:Row[]=[],recordRevisions:Row[]=[],recordPayloads:Row[]=[],recordDecisions:Row[]=[],recordDecisionPayloads:Row[]=[];
    const timeHeads:Row[]=[],timeRevisions:Row[]=[],timePayloads:Row[]=[],timeDecisions:Row[]=[],timeDecisionPayloads:Row[]=[],actuals:Row[]=[],packageHeads:Row[]=[],commandReceipts:Row[]=[];
    for(const [i,e] of engagements.entries()){
      const author=users[i%5],activityIds:string[]=[];
      for(let j=0;j<20;j++){const id=randomUUID(),revisionId=randomUUID();activityIds.push(revisionId);
        recordHeads.push({...scope,id,engagement_id:e.engagementId,baseline_id:e.baselineId,kind:"activity",author_membership_id:author.membershipId,state:j<5?"accepted":"submitted",version:3});
        recordRevisions.push({...scope,id:revisionId,engagement_id:e.engagementId,record_id:id,kind:"activity",revision_number:1,baseline_id:e.baselineId,audience:"delivery",event_date:date,timezone:"UTC",work_package_key:"proof",content_digest:recordDigest,actor_membership_id:author.membershipId});
        recordPayloads.push({revision_id:revisionId,content:baseRecord});
        if(j<5){const decisionId=randomUUID();recordDecisions.push({...scope,id:decisionId,engagement_id:e.engagementId,record_id:id,revision_id:revisionId,action:"accept",expected_version:2,request_key:randomUUID(),preview_digest:recordDigest,actor_membership_id:actor.membershipId});recordDecisionPayloads.push({decision_id:decisionId,rationale:"Synthetic historical load approval; not journey evidence"});}
      }
      for(let j=0;j<50;j++){const id=randomUUID(),revisionId=randomUUID(),resourceId=resources[(i+j)%500],decisionId=randomUUID();
        const content=timeInputSchema.parse({baselineId:e.baselineId,resourceId,workPackageKey:"proof",serviceDate:date,timezone:"UTC",minutes:1,billable:true,activityRevisionId:activityIds[0],allocationRevisionId:null,note:"PRIVATE_BENCHMARK_TIME_NOTE",onBehalfRationale:"Synthetic reviewer transcribes historical load"});
        const contentDigest=executionDigest({...content,authorMembershipId:author.membershipId,subjectMembershipId:resourceId===resources[0]?f.author.membershipId:null,timezoneVersion:calendarRevision.timezone_data_version});
        timeHeads.push({...scope,id,engagement_id:e.engagementId,author_membership_id:author.membershipId,state:j<5?"approved":"submitted",version:2});
        timeRevisions.push({...scope,id:revisionId,engagement_id:e.engagementId,entry_id:id,resource_id:resourceId,author_membership_id:author.membershipId,subject_membership_id:resourceId===resources[0]?f.author.membershipId:null,revision_number:1,baseline_id:e.baselineId,work_package_key:"proof",service_date:date,timezone:"UTC",timezone_version:calendarRevision.timezone_data_version,minutes:1,billable:true,activity_revision_id:activityIds[0],content_digest:contentDigest,actor_membership_id:actor.membershipId});
        timePayloads.push({revision_id:revisionId,note:content.note,exception_proposals:{on_behalf:content.onBehalfRationale}});
        if(j<5){timeDecisions.push({...scope,id:decisionId,engagement_id:e.engagementId,entry_id:id,revision_id:revisionId,action:"approve",request_key:randomUUID(),expected_version:1,preview_digest:contentDigest,actor_membership_id:actor.membershipId});timeDecisionPayloads.push({decision_id:decisionId,rationale:"Synthetic historical time approval; not journey evidence",exceptions:{on_behalf:"Human fixture attribution",unplanned:"Historical unbooked time"}});
          actuals.push({...scope,id:randomUUID(),engagement_id:e.engagementId,entry_id:id,revision_id:revisionId,decision_id:decisionId,resource_id:resourceId,baseline_id:e.baselineId,work_package_key:"proof",service_date:date,minutes:1,billable:true});}
        if(j===5)candidates.push({engagementId:e.engagementId,entryId:id,revisionId,contentDigest});
      }
      packageHeads.push({...scope,id:randomUUID(),engagement_id:e.engagementId,baseline_id:e.baselineId,work_package_key:"proof"});
      const key=randomUUID();receipts.push({actor:author,key,engagementId:e.engagementId});
      commandReceipts.push({...scope,id:randomUUID(),engagement_id:e.engagementId,actor_membership_id:author.membershipId,request_key:key,action:"setup",request_digest:executionDigest({synthetic:i}),execution_generation:1,result:{state:"committed",executionGeneration:1,changed:[{id:e.engagementId,version:1}]}});
    }
    for(const [table,rows] of [["execution_records",recordHeads],["execution_record_revisions",recordRevisions],["execution_record_payloads",recordPayloads],["execution_review_decisions",recordDecisions],["execution_review_payloads",recordDecisionPayloads],["execution_time_entries",timeHeads],["execution_time_revisions",timeRevisions],["execution_time_payloads",timePayloads],["execution_time_decisions",timeDecisions],["execution_time_decision_payloads",timeDecisionPayloads]] as const)await bulk(db,table,rows);
    await db.query("UPDATE execution_records r SET current_revision_id=v.id,accepted_revision_id=CASE WHEN r.state='accepted' THEN v.id ELSE NULL END FROM execution_record_revisions v WHERE v.record_id=r.id");
    await db.query("UPDATE execution_time_entries h SET current_revision_id=v.id,approved_revision_id=CASE WHEN h.state='approved' THEN v.id ELSE NULL END FROM execution_time_revisions v WHERE v.entry_id=h.id");
    await bulk(db,"execution_resource_days",resources.map(id=>({...scope,resource_id:id,service_date:date,timezone:"UTC",timezone_version:calendarRevision.timezone_data_version,approved_minutes:10,generation:1})).map(({customer_id,...r})=>r));
    await bulk(db,"execution_actual_days",actuals);await bulk(db,"execution_actual_package_heads",packageHeads);await bulk(db,"execution_command_receipts",commandReceipts);
    const counts=(await db.query(`SELECT (SELECT count(*)::int FROM engagements) AS engagements,(SELECT count(*)::int FROM workforce_resources) AS resources,
      (SELECT count(*)::int FROM execution_time_revisions) AS "timeRevisions",(SELECT count(*)::int FROM execution_record_revisions) AS "recordRevisions",
      (SELECT count(*)::int FROM execution_review_decisions)+(SELECT count(*)::int FROM execution_time_decisions) AS decisions`)).rows[0];
    for(const [key,value] of Object.entries(counts))if(value!==executionBenchmarkShape[key as keyof typeof executionBenchmarkShape])throw new Error("Representative execution corpus incomplete");
    const incorrect=await db.query(`SELECT 1 FROM execution_resource_days d LEFT JOIN (SELECT resource_id,service_date,SUM(minutes) AS n FROM execution_actual_days GROUP BY resource_id,service_date) a USING(resource_id,service_date) WHERE d.approved_minutes IS DISTINCT FROM a.n::int`);
    if(incorrect.rowCount)throw new Error("Synthetic load ledgers disagree");
    await db.query("ANALYZE");
  });
  return {users,reviewer:actor,engagements,resources,period,receipts,candidates,setup};
}
