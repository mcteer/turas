import { createHash,randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir,readFile,writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentSession } from "../lib/server/auth/sessions";
import { withTransaction } from "../lib/server/db/client";
import { prepareAttempt } from "../lib/server/conversations/dispatch";
import { submitPlanCommand } from "../lib/server/plans/commands";
import { createPlanReviewPreview,decidePlan } from "../lib/server/plans/decisions";
import { cancelPlanDraft,getPlanDraft,startPlanDraft } from "../lib/server/plans/drafting";
import { runPlanCleanupTick } from "../lib/server/plans/cleanup";
import { PLAN_FIXTURE_SCOPE,syntheticPlanContent } from "../tests/fixtures/plans/seed";
import { withPlanEvalEnvironment } from "./plan-eval-environment";

if(process.argv.slice(2).join(" ")!=="--disposable") {
  throw new Error("Use --disposable with the separate marked test database");
}

async function scenario(empty:boolean) {
  return withPlanEvalEnvironment(async(environment)=>{
    if(empty){
      const bootstrapped=spawnSync(process.execPath,
        ["--experimental-strip-types","scripts/bootstrap-demo.ts"],{
          cwd:environment.appRoot,env:process.env,stdio:"ignore",timeout:30_000});
      if(bootstrapped.status!==0)throw new Error("Disposable empty demo bootstrap failed");
    }
    await environment.start();
    const origin=environment.origin;
    const signedIn=await fetch(`${origin}/api/auth/login`,{method:"POST",
      headers:{origin,"content-type":"application/json"},
      body:JSON.stringify({username:process.env.TURAS_DEMO_USERNAME,
        password:process.env.TURAS_DEMO_PASSWORD})});
    if(!signedIn.ok)throw new Error("Disposable recovery login failed");
    const cookie=signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const csrf=(await signedIn.json() as {data?:{csrfToken?:string}})
      .data?.csrfToken ?? "";
    if(!cookie || !csrf)throw new Error("Disposable recovery session missing");
    const actor=await getCurrentSession(new Request(`${origin}/api/auth/session`,{
      headers:{cookie}}));
    if(!actor)throw new Error("Disposable recovery actor missing");
    const prepared=await withTransaction(async(db)=>{
      const schema=await db.query<{schema_version:number}>(
        "SELECT schema_version FROM turas_environment LIMIT 1");
      if(schema.rows[0]?.schema_version!==31)
        throw new Error("Disposable recovery schema is not 031");
      const content=syntheticPlanContent();
      content.assertions=[];content.sourceDependencies=[];
      const created=await submitPlanCommand(actor,{action:"create",
        requestKey:`plan_${randomUUID()}`,workspaceId:PLAN_FIXTURE_SCOPE.workspaceId,
        customerId:PLAN_FIXTURE_SCOPE.customerId,workloadId:null,audience:"delivery",
        ownerMembershipId:actor.membershipId,content},db);
      const submitted=await submitPlanCommand(actor,{action:"submit",
        requestKey:`plan_${randomUUID()}`,planId:created.planId,
        expectedAggregateVersion:created.aggregateVersion,
        revisionId:created.revisionId,contentDigest:created.contentDigest},db);
      const preview=await createPlanReviewPreview(actor,created.planId,{
        requestKey:`plan_${randomUUID()}`,expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest},db);
      const decisionInput={action:"accept" as const,requestKey:`plan_${randomUUID()}`,
        expectedAggregateVersion:submitted.aggregateVersion,
        revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,
        reviewPreviewId:preview.previewId,
        rationale:"Reviewed synthetic recovery baseline",
        deliverySuitabilityConfirmed:true};
      const accepted=await decidePlan(actor,created.planId,decisionInput,db);
      const first=await startPlanDraft(actor,{requestKey:randomUUID(),
        planId:created.planId,baseRevisionId:created.revisionId,
        expectedAggregateVersion:accepted.aggregateVersion,
        instructions:"Synthetic cancelled recovery request"},db);
      await cancelPlanDraft(actor,first.attemptId,db);
      const second=await startPlanDraft(actor,{requestKey:randomUUID(),
        planId:created.planId,baseRevisionId:created.revisionId,
        expectedAggregateVersion:accepted.aggregateVersion,
        instructions:"Synthetic unconfirmed recovery request"},db);
      return {created,accepted,decisionInput,first,second};
    });
    const headers={cookie,origin,"content-type":"application/json",
      "x-csrf-token":csrf,"x-turas-conversation-id":prepared.second.conversationId};
    let nativeId="";
    for(let index=0;index<5;index += 1){
      const bound=await fetch(`${origin}/eve/v1/session`,{method:"POST",headers,
        body:JSON.stringify({operationId:prepared.second.operationId}),
        signal:AbortSignal.timeout(10_000)});
      if(bound.ok){nativeId=(await bound.json() as {sessionId:string}).sessionId;break;}
      if(bound.status!==409)throw new Error("Disposable native binding failed");
      await new Promise((resolve)=>setTimeout(resolve,1_000));
    }
    if(!nativeId)throw new Error("Disposable native session unavailable");
    const controlOperationId=randomUUID();
    const controlCreated=await fetch(`${origin}/api/conversations`,{method:"POST",
      headers:{cookie,origin,"content-type":"application/json","x-csrf-token":csrf},
      body:JSON.stringify({customerId:PLAN_FIXTURE_SCOPE.customerId,
        requestKey:controlOperationId,title:"Synthetic native recovery control"})});
    if(controlCreated.status!==201)throw new Error("Disposable control conversation failed");
    const controlConversationId=(await controlCreated.json() as {data:{id:string}}).data.id;
    let controlNativeId="";
    for(let index=0;index<5;index += 1){
      const bound=await fetch(`${origin}/eve/v1/session`,{method:"POST",headers:{
        cookie,origin,"content-type":"application/json","x-csrf-token":csrf,
        "x-turas-conversation-id":controlConversationId},
        body:JSON.stringify({operationId:controlOperationId}),
        signal:AbortSignal.timeout(10_000)});
      if(bound.ok){controlNativeId=(await bound.json() as {sessionId:string}).sessionId;break;}
      if(bound.status!==409)throw new Error("Disposable control native binding failed");
      await new Promise((resolve)=>setTimeout(resolve,1_000));
    }
    if(!controlNativeId)throw new Error("Disposable control native session unavailable");
    await withTransaction(async(db)=>{
      await prepareAttempt(actor,prepared.second.conversationId,nativeId,
        prepared.second.requestKey,prepared.second.instructions,[],db);
      await db.query(`UPDATE plan_drafting_attempts SET deadline_at=now()-interval '1 second'
        WHERE id=$1`,[prepared.second.attemptId]);
    });
    await runPlanCleanupTick();
    if((await getPlanDraft(actor,prepared.second.attemptId)).state!=="unconfirmed")
      throw new Error("Expired dispatched plan attempt was not quarantined");
    await environment.stop();
    const probeDir=join(environment.storeRoot,"objects");
    await mkdir(probeDir,{recursive:true,mode:0o700});
    const probe=join(probeDir,`plan-recovery-${randomUUID()}.bin`);
    const bytes=Buffer.from("Synthetic 006 paired store restart fixture");
    await writeFile(probe,bytes,{mode:0o600});
    const digest=createHash("sha256").update(bytes).digest("hex");
    await environment.start();
    if(createHash("sha256").update(await readFile(probe)).digest("hex")!==digest)
      throw new Error("Disposable paired store changed across restart");
    const restored=await withTransaction(async(db)=>{
      const row=await db.query<{engagement_id:string;active_baseline_id:string;
        accepted_revision_id:string;decision_count:string;baseline_count:string;
        eve_session_id:string}>(`SELECT plan.engagement_id,
          engagement.active_baseline_id,plan.accepted_revision_id,
          (SELECT count(*)::text FROM plan_decisions WHERE plan_id=plan.id) AS decision_count,
          (SELECT count(*)::text FROM milestone_baselines WHERE plan_id=plan.id) AS baseline_count,
          conversation.eve_session_id
        FROM delivery_plans plan JOIN engagements engagement ON engagement.id=plan.engagement_id
        JOIN conversations conversation ON conversation.id=$2 WHERE plan.id=$1`,
      [prepared.created.planId,prepared.second.conversationId]);
      return row.rows[0];
    });
    if(!restored || restored.engagement_id!==prepared.accepted.engagementId ||
        restored.active_baseline_id!==prepared.accepted.baselineId ||
        restored.accepted_revision_id!==prepared.created.revisionId ||
        restored.eve_session_id!==nativeId || restored.decision_count!=="1" ||
        restored.baseline_count!=="1") {
      throw new Error("Disposable accepted baseline or native binding changed across restart");
    }
    const controlStream=await fetch(`${origin}/eve/v1/session/${controlNativeId}/stream?startIndex=-1&includeTailIndex=1`,{
      headers:{cookie},signal:AbortSignal.timeout(15_000)});
    if(!controlStream.ok)throw new Error("Disposable control native stream unavailable after restart");
    await controlStream.body?.cancel();
    const quarantinedStream=await fetch(`${origin}/eve/v1/session/${nativeId}/stream?startIndex=-1&includeTailIndex=1`,{
      headers:{cookie},signal:AbortSignal.timeout(15_000)});
    if(![403,404,409].includes(quarantinedStream.status))
      throw new Error(`Unconfirmed plan stream was not denied (${quarantinedStream.status})`);
    await quarantinedStream.body?.cancel();
    if((await getPlanDraft(actor,prepared.first.attemptId)).state!=="cancelled" ||
        (await getPlanDraft(actor,prepared.second.attemptId)).state!=="unconfirmed") {
      throw new Error("Disposable terminal plan attempts changed across restart");
    }
    const prior=process.env.TURAS_006_DISABLED;
    process.env.TURAS_006_DISABLED="1";
    try {
      let blocked=false;
      try {await startPlanDraft(actor,{requestKey:randomUUID(),
        planId:prepared.created.planId,baseRevisionId:prepared.created.revisionId,
        expectedAggregateVersion:prepared.accepted.aggregateVersion,
        instructions:"Synthetic disabled intake"});}
      catch(error){blocked=(error as {code?:string}).code==="plans_disabled";}
      if(!blocked)throw new Error("006 intake did not close on disable switch");
    } finally {
      if(prior===undefined)delete process.env.TURAS_006_DISABLED;
      else process.env.TURAS_006_DISABLED=prior;
    }
    const replay=await withTransaction((db)=>decidePlan(actor,prepared.created.planId,
      prepared.decisionInput,db));
    if(replay.decisionId!==prepared.accepted.decisionId)
      throw new Error("Disposable decision receipt changed across restart");
    await environment.stop();
    return {mode:empty ? "empty":"028-upgrade",schemaVersion:31,
      decisionCount:1,baselineCount:1,cancelled:true,unconfirmed:true,
      nativeRestored:true,storeRestored:true};
  },{empty});
}

const results=[];
results.push(await scenario(false));
results.push(await scenario(true));
console.log(JSON.stringify({kind:"plans_recovery",results}));
