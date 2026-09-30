import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { PoolClient } from "pg";
import { buildStoredPlanContent,planDraftContentSchema,
  type PlanDraftContent } from "../lib/contracts/plan-content";
import { planSha256 } from "../lib/contracts/plans";
import { DEMO_IDS } from "../lib/server/bootstrap-ids";
import { withTransaction } from "../lib/server/db/client";
import { submitPlanCommand } from "../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../lib/server/plans/decisions";
import { listPlans,readPlan } from "../lib/server/plans/read";
import { ingestVerifiedResearch } from "../lib/server/profiles/research";
import { materializeCurrentProjection } from "../lib/server/retrieval/projections";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../tests/fixtures/plans/seed";
import { createProfileTestSession } from "../tests/fixtures/profiles";
import { withPlanEvalEnvironment } from "./plan-eval-environment";

if(process.argv.slice(2).join(" ")!=="--disposable")
  throw new Error("Use --disposable with the separate marked test database");

type PlanHead={plan_id:string;revision_id:string;content_digest:string};
function p95(values:number[]):number {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.ceil(sorted.length*0.95)-1] ?? Infinity;
}

async function seedCorpus(db:PoolClient,actorMembershipId:string) {
  const content=syntheticPlanContent();
  content.assertions=[];content.sourceDependencies=[];
  const body=buildStoredPlanContent(content);
  const digest=planSha256(body),contextDigest=planSha256([]);
  const marker=randomUUID().slice(0,8);
  const source=await ingestVerifiedResearch({
    workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
    customerId:PLAN_FIXTURE_SCOPE.customerId,
    trustedIdentity:"synthetic-fixture-v1",
    location:`https://example.com/plan-benchmark-source-${marker}`,
    title:"Synthetic benchmark source",passage:`Synthetic delivery capability ${marker}`,
    supportedClaim:`Synthetic delivery capability ${marker}`,
    publicationAt:"2026-09-28T12:00:00Z",retrievalAt:"2026-09-29T12:00:00Z",
    rights:"Synthetic public fixture",audience:"delivery",
    qualityInput:{rubricVersion:"evidence-quality-v1",R:3,D:4,C:1,
      reliabilityRationale:"Named synthetic source",
      directnessRationale:"Direct synthetic passage",
      corroborationRationale:"Single synthetic source",
      informationType:"product_capability",dateBasis:"publication"},
    checks:{identity:true,scope:true,integrity:true,content:true,
      rationale:"Synthetic source checked",checkVersion:"research-check-v1"},
  },db);
  const sourceId=await materializeCurrentProjection(db,"verified_research",
    source.sourceRevisionId,"delivery");
  if(!sourceId)throw new Error("Benchmark research projection unavailable");
  const projection=await db.query<{source_generation:string;content_digest:string;
    locators:unknown[]}>(`SELECT source.source_generation,source.content_digest,
      passage.locators FROM retrieval_sources source
      JOIN retrieval_passages passage ON passage.source_id=source.id
      WHERE source.id=$1 ORDER BY passage.ordinal LIMIT 1`,[sourceId]);
  const sourceContent=syntheticPlanContent() as unknown as PlanDraftContent;
  const dependencyId=randomUUID();
  const reference:PlanDraftContent["sourceDependencies"][number]={
    id:dependencyId,kind:"verified_research",sourceRevisionId:source.sourceRevisionId,
    generation:Number(projection.rows[0].source_generation),
    contentDigest:projection.rows[0].content_digest,
    locator:projection.rows[0].locators[0] as PlanDraftContent["sourceDependencies"][number]["locator"]};
  sourceContent.sourceDependencies=[reference];
  sourceContent.assertions=[{key:"benchmark_research",kind:"attributed_research",
    text:`Synthetic delivery capability ${marker}`,
    sourceDependencyIds:[dependencyId],decisionCritical:false}];
  const sourceBody=buildStoredPlanContent(sourceContent);
  const sourceDigest=planSha256(sourceBody);
  const sourceContextDigest=planSha256([`${reference.kind}:${reference.sourceRevisionId}:${
    reference.generation}:${reference.contentDigest}`]);
  await db.query(`CREATE TEMP TABLE benchmark_plan_ids AS
    SELECT series.index,gen_random_uuid() AS id,
      CASE WHEN series.index<=500 THEN $1::uuid ELSE $2::uuid END AS customer_id
    FROM generate_series(1,1000) AS series(index)`,
  [PLAN_FIXTURE_SCOPE.customerId,DEMO_IDS.deniedCustomer]);
  await db.query(`CREATE TEMP TABLE benchmark_revision_ids AS
    SELECT plan.index,plan.id AS plan_id,plan.customer_id,revision.number,
      gen_random_uuid() AS id FROM benchmark_plan_ids plan
      CROSS JOIN generate_series(1,20) AS revision(number)`);
  await db.query(`INSERT INTO delivery_plans
    (id,environment_id,workspace_id,customer_id,audience,
     owner_membership_id,created_by_membership_id,aggregate_version)
    SELECT id,$1,$2,customer_id,'delivery',$3,$3,20 FROM benchmark_plan_ids`,
  [process.env.TURAS_TEST_ENVIRONMENT_ID,PLAN_FIXTURE_SCOPE.workspaceId,
    actorMembershipId]);
  for(let number=1;number<=20;number += 1){
    await db.query(`INSERT INTO plan_revisions
      (id,plan_id,environment_id,workspace_id,customer_id,revision_number,
       parent_revision_id,author_membership_id,template_version,
       content_schema_version,content_digest,context_digest,
       evidence_quality_version,as_of,origin)
      SELECT current.id,current.plan_id,$2,$3,current.customer_id,
        current.number,parent.id,$4,'delivery-plan-v1','plan-content-v1',
        CASE WHEN current.index<=10 THEN $5 ELSE $6 END,
        CASE WHEN current.index<=10 THEN $7 ELSE $8 END,
        'evidence-quality-v1',$9,'manual'
      FROM benchmark_revision_ids current
      LEFT JOIN benchmark_revision_ids parent ON parent.plan_id=current.plan_id
        AND parent.number=current.number-1
      WHERE current.number=$1`,
    [number,process.env.TURAS_TEST_ENVIRONMENT_ID,PLAN_FIXTURE_SCOPE.workspaceId,
      actorMembershipId,sourceDigest,digest,sourceContextDigest,contextDigest,
      content.asOf]);
  }
  const inserted=await db.query(`INSERT INTO plan_revision_payloads
    (revision_id,title,content,change_reason)
    SELECT id,CASE WHEN index<=10 THEN $1 ELSE $2 END,
      CASE WHEN index<=10 THEN $3::jsonb ELSE $4::jsonb END,
      CASE WHEN number=1 THEN NULL ELSE 'Synthetic revision' END
    FROM benchmark_revision_ids`,[sourceContent.title,content.title,
      JSON.stringify(sourceBody),JSON.stringify(body)]);
  if(inserted.rowCount!==20_000)throw new Error("Benchmark revision corpus incomplete");
  await db.query(`INSERT INTO plan_source_dependencies
    (revision_id,dependency_id,source_kind,source_revision_id,source_generation,
     source_digest,locator)
    SELECT id,$1,'verified_research',$2,$3,$4,$5::jsonb
    FROM benchmark_revision_ids WHERE index<=10`,
  [dependencyId,reference.sourceRevisionId,reference.generation,
    reference.contentDigest,JSON.stringify(reference.locator)]);
  await db.query(`UPDATE delivery_plans plan SET working_revision_id=revision.id
    FROM benchmark_revision_ids revision WHERE revision.plan_id=plan.id
      AND revision.number=20`);
  const heads=await db.query<PlanHead>(`SELECT plan_id,id AS revision_id,
    CASE WHEN index<=10 THEN $1 ELSE $2 END AS content_digest
    FROM benchmark_revision_ids WHERE number=20 AND
      (index=1 OR index BETWEEN 11 AND 14) ORDER BY index`,[sourceDigest,digest]);
  await db.query(`INSERT INTO plan_revision_events
    (id,plan_id,revision_id,state,actor_membership_id,operation_id)
    SELECT gen_random_uuid(),plan_id,id,'draft',$1,gen_random_uuid()
    FROM benchmark_revision_ids WHERE number=20 AND
      (index=1 OR index BETWEEN 11 AND 14)`,[actorMembershipId]);
  return {heads:heads.rows};
}

await withPlanEvalEnvironment(async()=>{
  const {actor,partner,heads}=await withTransaction(async(db)=>{
    const actor=await createProfileTestSession(db,"mcteer");
    const partner=await createProfileTestSession(db,"partner");
    const seeded=await seedCorpus(db,actor.membershipId);
    const counts=await db.query<{plans:string;revisions:string}>(`
      SELECT (SELECT count(*)::text FROM delivery_plans WHERE environment_id=$1) AS plans,
        (SELECT count(*)::text FROM plan_revisions WHERE environment_id=$1) AS revisions`,
    [process.env.TURAS_TEST_ENVIRONMENT_ID]);
    if(Number(counts.rows[0].plans)!==1000 || Number(counts.rows[0].revisions)!==20000)
      throw new Error("Benchmark corpus count incomplete");
    return {actor,partner,...seeded};
  });
  let hidden=false;
  try {await listPlans(partner,DEMO_IDS.deniedCustomer);} catch(error){
    hidden=(error as {status?:number}).status===404;
  }
  if(!hidden)throw new Error("Benchmark hidden customer scope was readable");
  const decisions=[];
  for(const head of heads){
    const accepted=await withTransaction(async(db)=>{
      const submitted=await submitPlanCommand(actor,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:head.plan_id,
        expectedAggregateVersion:20,revisionId:head.revision_id,
        contentDigest:head.content_digest},db);
      const preview=await createPlanReviewPreview(actor,head.plan_id,{
        requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:head.revision_id,contentDigest:head.content_digest},db);
      const input={action:"accept" as const,requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:head.revision_id,contentDigest:head.content_digest,
        reviewPreviewId:preview.previewId,
        rationale:"Reviewed synthetic benchmark baseline",
        deliverySuitabilityConfirmed:true};
      const receipt=await decidePlan(actor,head.plan_id,input,db);
      return {planId:head.plan_id,input,receipt};
    });
    decisions.push(accepted);
  }
  const large=syntheticPlanContent() as unknown as PlanDraftContent;
  large.title="Synthetic bounded maximum-payload plan";
  large.sourceDependencies=[];
  for(const section of large.sections){
    if(section.state==="content")section.narrative=
      "Synthetic bounded section. ".padEnd(3_400,"x");
  }
  large.assertions=Array.from({length:100},(_,index)=>({
    key:`proposal_${index}`,kind:"proposal" as const,
    text:`Synthetic proposed action ${index}. `.padEnd(820,"x"),
    sourceDependencyIds:[],decisionCritical:false}));
  planDraftContentSchema.parse(large);
  const largeBytes=Buffer.byteLength(JSON.stringify(buildStoredPlanContent(large)),"utf8");
  if(largeBytes<110_000 || largeBytes>131_072)
    throw new Error("Maximum-payload probe is outside the bounded target");
  const largePlan=await submitPlanCommand(actor,{action:"create",
    requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
    customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
    ownerMembershipId:actor.membershipId,content:large});
  const largeStarted=performance.now();
  const largeDetail=await readPlan(actor,largePlan.planId);
  const maxPayloadDetailMs=Math.round(performance.now()-largeStarted);
  if(largeDetail.contentAvailability!=="readable")
    throw new Error("Maximum-payload detail unavailable");
  const samples:{[key:string]:number[]}={list:[],detail:[],decision:[]};
  const failures:{[key:string]:number}={list:0,detail:0,decision:0};
  const started=Date.now();
  for(const operation of ["list","detail","decision"] as const){
    for(let group=0;group<22;group += 1){
      if(Date.now()-started>15*60_000)throw new Error(
        `Benchmark deadline exceeded at ${operation} group ${group}`);
      await Promise.all(Array.from({length:5},async(_,clientIndex)=>{
        const begin=performance.now();
        try {
          if(operation==="list"){
            const result=await listPlans(actor,PLAN_FIXTURE_SCOPE.customerId,{limit:20});
            if(result.items.length!==20)throw new Error("Benchmark list page incomplete");
          } else if(operation==="detail"){
            const detail=await readPlan(actor,heads[clientIndex].plan_id);
            if(detail.revisionNumber!==20 || !detail.content)
              throw new Error("Benchmark detail unavailable");
          } else {
            const item=decisions[clientIndex];
            const receipt=await decidePlan(actor,item.planId,item.input);
            if(receipt.decisionId!==item.receipt.decisionId)
              throw new Error("Benchmark decision replay changed identity");
          }
          if(group>=2)samples[operation].push(performance.now()-begin);
        } catch {failures[operation] += 1;}
      }));
    }
    console.info(JSON.stringify({kind:"plans_benchmark_progress",operation,
      measured:samples[operation].length,failures:failures[operation]}));
  }
  const result={kind:"plans_benchmark",corpusPlans:1000,
    corpusRevisions:20_000,sourceBoundPlans:10,
    authorizedCustomerPlans:500,hiddenPartnerCustomerPlans:500,
    maximumPayloadBytes:largeBytes,maxPayloadDetailMs,
    clients:5,warmupsPerClass:10,
    measuredPerClass:100,
    classes:Object.fromEntries((["list","detail","decision"] as const).map((name)=>[
      name,{measured:samples[name].length,failures:failures[name],
        p95Ms:Math.round(p95(samples[name]))}])),
    excluded:["model_generation","external_evidence_retrieval"]};
  console.log(JSON.stringify(result));
  if(Object.values(result.classes).some((item)=>item.measured!==100 ||
      item.failures!==0 || item.p95Ms>2_000))process.exitCode=1;
});
