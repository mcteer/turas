import {expect,it} from "vitest";
import {withExecutionNativeCase} from "../fixtures/execution/native";
import {readExecutionLiveEvidence,executionLiveDomainDigests} from "../../scripts/execution-live-evidence";
import {captureExecutionLiveStream} from "../../scripts/execution-live-stream";
import {probeExecutionLiveDeniedTools} from "../fixtures/execution/live-denial";
import {runExecutionCleanupTick} from "../../lib/server/execution/maintenance";
import {query} from "../../lib/server/db/client";
it("captures actual native fake-provider IO and GET output, denies guarded callbacks, then retires only that owned session",async()=>{
  await withExecutionNativeCase("normal",async f=>{
    const before=await executionLiveDomainDigests(),started=Date.now();
    expect(await f.send()).toBe(202);
    const settled=await f.settled();
    const row=(await query("SELECT r.native_turn_id FROM execution_advice_attempts a JOIN response_attempts r ON r.id=a.response_attempt_id WHERE a.id=$1",[f.reserved.attemptId])).rows[0];
    const capture=await captureExecutionLiveStream({origin:f.environment.origin,cookie:f.captureAuth.cookie,nativeSessionId:f.nativeSessionId,
      turnId:row.native_turn_id,deadlineAt:started+120000,suiteDeadlineAt:started+1200000});
    expect(capture.outcome).toBe("terminal");expect(JSON.stringify(capture.events)).toContain("Synthetic reviewed execution explanation");
    expect(settled).toMatchObject({state:"completed",inputTokens:22,outputTokens:14});
    const proof=await readExecutionLiveEvidence(f.reserved.attemptId);
    expect(proof.steps).toHaveLength(2);
    expect(proof.steps.every(s=>s.provider?.path==="stream"&&s.provider.maxOutputTokens===4096&&s.provider.deadlineMs<=120000&&s.usage.source==="reported")).toBe(true);
    const denied=await probeExecutionLiveDeniedTools(f.reserved.attemptId);expect(denied).toHaveLength(6);
    expect(await executionLiveDomainDigests()).toEqual(before);
    await f.withdrawEvidence();
    await query("UPDATE execution_cleanup_jobs SET ineligible_at=now()-interval '31 days',due_at=now()-interval '1 day' WHERE engagement_id=$1",[f.source.engagementId]);
    await runExecutionCleanupTick();
    const deadline=Date.now()+20000;let retired=false;
    while(Date.now()<deadline){retired=(await query("SELECT state FROM execution_native_retirement_receipts WHERE attempt_id=$1",[f.reserved.attemptId])).rows[0]?.state==="done";
      if(retired)break;await new Promise(r=>setTimeout(r,250));}
    expect(retired).toBe(true);expect(await f.reconnect()).toBe(409);
    expect(await f.providerCalls()).toHaveLength(2);expect(await f.usageCount()).toBe(2);
  },true);
},240000);

import {executionLiveCaseIds} from "../fixtures/execution/advisory";
it.each(executionLiveCaseIds)("passes richer %s governed inputs through the actual native fake-provider capture",async id=>{
  await withExecutionNativeCase("normal",async f=>{
    const before=await executionLiveDomainDigests();expect(await f.send()).toBe(202);
    expect(await f.settled()).toMatchObject({state:"completed",outputReadable:true});
    const proof=await readExecutionLiveEvidence(f.reserved.attemptId);
    if(!("expectedNumbers" in f.source))throw new Error("Required case fixture missing");
    for(const [key,expected] of Object.entries(f.source.expectedNumbers as Record<string,string|null>))expect(proof.context.execution.summary.effort[key]).toBe(expected);
    expect(proof.steps).toHaveLength(2);expect(proof.advice.context_bytes).toBeLessThanOrEqual(24576);
    expect(await executionLiveDomainDigests()).toEqual(before);
  },true,id);
},240000);
