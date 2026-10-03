import {randomUUID} from "node:crypto";
import {writeFile,stat} from "node:fs/promises";
import {join} from "node:path";
import {expect,it} from "vitest";
import {withExecutionNativeCase} from "../fixtures/execution/native";
import {restoreOwnedExecutionPair} from "../fixtures/execution/restore";
import {draftTime,submitTime,timeCandidate,decideTime,timeCommand} from "../fixtures/execution/time";
import {saveRegister,submitRegister,reviewRegister,replaceBaseline} from "../fixtures/execution/registers";
import {createResource} from "../../lib/server/staffing/resources";
import {syntheticResource} from "../fixtures/staffing/seed";
import {readExecutionOverview,readExecutionRecords,previewExecutionCommand,submitExecutionCommand} from "../../lib/server/execution/service";
import {readExecutionReceipt} from "../../lib/server/execution/commands";
import {readExecutionTime} from "../../lib/server/execution/time";
import {claimExecutionCleanup,finishExecutionCleanup,runExecutionCleanupTick} from "../../lib/server/execution/maintenance";
import {query} from "../../lib/server/db/client";
it("restores matched DB/private/Eve state with moved-time lost acknowledgement, exact leases and newer payloads",async()=>{
  await withExecutionNativeCase("normal",async native=>{
    const f=native.source;await native.send();await native.settled();const calls=(await native.providerCalls()).length;await native.environment.stop();
    let entry=await submitTime(f,await draftTime(f));await decideTime(f,await timeCandidate(f,[entry]));
    entry=(await readExecutionTime(f.reviewer,f.engagementId,f.period)).entries[0];
    const other=await createResource(f.reviewer,{requestKey:randomUUID(),rationale:"Human reviewed corrected recovery subject",resource:{...syntheticResource(),timezone:"UTC"}});
    const date=new Date(Date.parse(f.date)-86400000).toISOString().slice(0,10),period={from:date,to:f.date},view=await readExecutionOverview(f.reviewer,f.engagementId);
    await submitExecutionCommand(f.reviewer,f.engagementId,timeCommand("time.revise",{execution:view.version,time:entry.version},{entryId:entry.id,time:{...f.time,resourceId:other.resourceId,serviceDate:date,minutes:90,onBehalfRationale:"Human corrects historical date and subject"}}));
    entry=await submitTime({...f,period},(await readExecutionTime(f.reviewer,f.engagementId,period)).entries[0],f.reviewer);
    const candidate=await timeCandidate(f,[entry],"time.approve",{on_behalf:"Human verifies the corrected subject",unplanned:"Human confirms historical unbooked work",unknown_capacity:"Human confirms historical UTC date"});
    const preview=await previewExecutionCommand(f.reviewer,f.engagementId,candidate),command={...candidate,previewDigest:preview.previewDigest,previewExpiresAt:preview.previewExpiresAt,requestKey:randomUUID(),rationale:"Human approves the exact corrected recovery time"};
    // Deliberately discard the committed response, then recover by key after restore.
    await submitExecutionCommand(f.reviewer,f.engagementId,command);
    const receipt=await readExecutionReceipt(f.reviewer,command.requestKey);
    const current=await submitRegister(f,await saveRegister(f,{...f.activity.content!,title:"New independently reviewed recovery activity"},{id:f.activity.id,version:(await readExecutionRecords(f.author,f.engagementId,{recordId:f.activity.id})).records[0].version}));
    await reviewRegister(f,current);
    await query("UPDATE execution_cleanup_jobs SET ineligible_at=now()-interval '31 days',due_at=now()-interval '1 day' WHERE engagement_id=$1",[f.engagementId]);
    const first=await claimExecutionCleanup();expect(first.length).toBeGreaterThan(0);
    const before=(await query("SELECT to_jsonb(d) AS row FROM execution_actual_days d WHERE engagement_id=$1",[f.engagementId])).rows;
    const probes=[native.environment.storeRoot,native.environment.workforceRoot,native.environment.workflowRoot].map(p=>join(p,"recovery-after-snapshot.bin"));
    const restored=await restoreOwnedExecutionPair(native.environment,async()=>{
      await replaceBaseline(f,{...f.content,title:"Synthetic replacement after snapshot"});
      for(const path of probes)await writeFile(path,"Synthetic state newer than the matched checkpoint",{flag:"wx",mode:0o600});
    });
    expect(restored.restoredDigests).toEqual(restored.snapshotDigests);
    for(const path of probes)expect(await stat(path).catch(()=>null)).toBeNull();
    expect((await readExecutionOverview(f.reviewer,f.engagementId)).baselineId).toBe(f.baselineId);
    expect(await readExecutionReceipt(f.reviewer,command.requestKey)).toEqual(receipt);
    expect(await submitExecutionCommand(f.reviewer,f.engagementId,command)).toEqual(receipt);
    expect((await query("SELECT to_jsonb(d) AS row FROM execution_actual_days d WHERE engagement_id=$1",[f.engagementId])).rows).toEqual(before);
    expect((await query("SELECT service_date::text,approved_minutes FROM execution_resource_days WHERE resource_id=$1",[other.resourceId])).rows).toEqual([{service_date:date,approved_minutes:90}]);
    expect((await query("SELECT approved_minutes FROM execution_resource_days WHERE resource_id=$1",[f.resourceId])).rows[0].approved_minutes).toBe(0);
    await query("UPDATE execution_cleanup_jobs SET lease_until=now()-interval '1 second' WHERE engagement_id=$1",[f.engagementId]);
    const replacement=await claimExecutionCleanup();for(const old of first)expect(await finishExecutionCleanup(old)).toBe(false);
    const disabled=process.env.TURAS_008_DISABLED;process.env.TURAS_008_DISABLED="1";
    try{
      const head=await readExecutionOverview(f.author,f.engagementId);
      await expect(submitExecutionCommand(f.author,f.engagementId,timeCommand("time.create",{execution:head.version},{time:f.time}))).rejects.toMatchObject({status:503});
      const removed=new Set<string>();
      for(const live of replacement){const identity=live.payload_kind+"/"+live.revision_id;
        if(await finishExecutionCleanup(live))removed.add(identity);else expect(removed.has(identity),"Only an already-purged duplicate can become stale").toBe(true);}
      expect(removed.size).toBeGreaterThan(0);
      const jobs=(await query("SELECT state FROM execution_cleanup_jobs WHERE id=ANY($1::uuid[])",[replacement.map(j=>j.id)])).rows;
      expect(jobs.every(j=>["done","stale"].includes(j.state))).toBe(true);
      expect((await query("SELECT content->>'title' AS title FROM execution_record_payloads WHERE revision_id=$1",[current.revisionId])).rows[0].title).toBe("New independently reviewed recovery activity");
      expect((await query("SELECT to_jsonb(d) AS row FROM execution_actual_days d WHERE engagement_id=$1",[f.engagementId])).rows).toEqual(before);
      expect(await runExecutionCleanupTick()).toMatchObject({claimed:0,purged:0});
    }finally{if(disabled===undefined)delete process.env.TURAS_008_DISABLED;else process.env.TURAS_008_DISABLED=disabled;}
    await native.restart();expect(await native.providerCalls()).toHaveLength(calls);expect(await native.send()).toBe(409);expect(await native.reconnect()).toBe(409);
    expect(await native.providerCalls()).toHaveLength(calls);
  });
},300000);
it("restores actual interrupted provider state as unknown without redispatch and permits disabled cancellation",async()=>{
  await withExecutionNativeCase("unknown",async f=>{
    expect(await f.send()).toBe(202);await f.waitAtProvider();expect(await f.providerCalls()).toHaveLength(1);
    const steps=(await query("SELECT to_jsonb(s) AS row FROM execution_advice_steps s WHERE attempt_id=$1",[f.reserved.attemptId])).rows;
    const restored=await restoreOwnedExecutionPair(f.environment,async()=>{
      await query("UPDATE execution_advice_attempts SET failure_code='recovery_probe' WHERE id=$1",[f.reserved.attemptId]);
      await writeFile(join(f.environment.workflowRoot,"recovery-after-snapshot.bin"),"Synthetic post-snapshot journal probe",{flag:"wx",mode:0o600});
    });
    expect(restored.restoredDigests).toEqual(restored.snapshotDigests);
    expect((await query("SELECT failure_code FROM execution_advice_attempts WHERE id=$1",[f.reserved.attemptId])).rows[0].failure_code).toBeNull();
    expect((await query("SELECT to_jsonb(s) AS row FROM execution_advice_steps s WHERE attempt_id=$1",[f.reserved.attemptId])).rows).toEqual(steps);
    await f.restart();const settled=await f.settled();expect(["unconfirmed","failed","expired","cancelled"]).toContain(settled.state);
    expect(settled.inputTokens).toBeNull();expect(settled.outputTokens).toBeNull();expect(settled.outputReadable).toBe(false);
    await f.send();await f.reconnect();expect(await f.providerCalls()).toHaveLength(1);
    await f.disable();await f.cancel();expect((await f.status()).outputReadable).toBe(false);expect(await f.providerCalls()).toHaveLength(1);
  });
},300000);
