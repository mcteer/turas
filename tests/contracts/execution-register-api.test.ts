import {randomUUID} from "node:crypto";
import {describe,it,expect} from "vitest";
import {withTransaction} from "../../lib/server/db/client";
import {registerFixture,registerBase,raidRecord,decisionRecord,scopeRecord,saveRegister,submitRegister,reviewRegister,executionCommand} from "../fixtures/execution/registers";
import {executionHttpActor,executionHttpContext,executionHttpRequest} from "../fixtures/execution/http";
import {POST} from "../../app/api/execution/engagements/[engagementId]/commands/route";
import {readExecutionRecords,readExecutionOverview,previewExecutionCommand,submitExecutionCommand} from "../../lib/server/execution/service";

describe("reviewed delivery register contracts",()=>{
  it("enforces dates, ownership and evidenced closure and keeps pending risk revisions private",async()=>{
    const f=await registerFixture(),author=await executionHttpActor("panel"),partner=await executionHttpActor("partner");
    const view=await readExecutionOverview(author,f.engagementId);
    for(const patch of [{reviewDate:"2026-02-30"},{unknownDateReason:null},{ownerMembershipId:null,unknownOwnerReason:null},
      {severity:"urgent"},{status:"resolved"},{status:"accepted_exception",acceptedExceptionRationale:null},{accepted:true}]){
      const response=await POST(executionHttpRequest(author,`/engagements/${f.engagementId}/commands`,executionCommand("record.create",{execution:view.version},
        {baselineId:f.baselineId,record:{...raidRecord(),...patch}})),executionHttpContext(f.engagementId));
      expect(response.status).toBe(400);
    }
    const first=await submitRegister(f,await saveRegister(f,raidRecord()));
    expect((await readExecutionRecords(partner,f.engagementId,{kind:"raid"})).records).toEqual([]);
    const current=await readExecutionOverview(f.author,f.engagementId);
    await expect(previewExecutionCommand(f.author,f.engagementId,{version:"execution-v1",action:"record.accept",expectedVersions:{execution:current.version,record:first.version},
      payload:{recordId:first.id,revisionId:first.revisionId,contentDigest:first.contentDigest}})).rejects.toMatchObject({status:403});
    await reviewRegister(f,first);
    const accepted=(await readExecutionRecords(f.author,f.engagementId,{recordId:first.id})).records[0];
    const exception={...raidRecord(),status:"accepted_exception",acceptedExceptionRationale:"Human accepts the documented residual delivery risk"};
    const proposed=await submitRegister(f,await saveRegister(f,exception,accepted));
    expect((await readExecutionRecords(partner,f.engagementId,{recordId:first.id})).records[0].content).toMatchObject({status:"open"});
    await reviewRegister(f,proposed);
    const closed=(await readExecutionRecords(f.author,f.engagementId,{recordId:first.id})).records[0];
    expect(closed.content).toMatchObject(exception);
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...raidRecord(),status:"monitoring"},closed)));
    expect((await readExecutionRecords(partner,f.engagementId,{recordId:first.id})).records[0].content).toMatchObject({status:"monitoring"});
    // A reviewed assumption remains an assumption; register review cannot create profile claims.
    const claims=await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM profile_records WHERE customer_id=$1",[f.customerId])).rows[0].n);
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...raidRecord(),raidType:"assumption",title:"Unverified adoption assumption"})));
    expect(await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM profile_records WHERE customer_id=$1",[f.customerId])).rows[0].n)).toBe(claims);
  });
  it("supersedes exact accepted decisions atomically and rejects a stale review",async()=>{
    const f=await registerFixture();
    const first=await submitRegister(f,await saveRegister(f,decisionRecord()));await reviewRegister(f,first);
    const replacement=await submitRegister(f,await saveRegister(f,{...decisionRecord(),title:"Replacement human decision",supersededDecisionIds:[first.id]}));
    const view=await readExecutionOverview(f.reviewer,f.engagementId),candidate={version:"execution-v1",action:"record.accept",expectedVersions:{execution:view.version,record:replacement.version},
      payload:{recordId:replacement.id,revisionId:replacement.revisionId,contentDigest:replacement.contentDigest}};
    const proof=await previewExecutionCommand(f.reviewer,f.engagementId,candidate);
    const old=(await readExecutionRecords(f.author,f.engagementId,{recordId:first.id})).records[0];
    await saveRegister(f,{...decisionRecord(),rationale:"Pending correction changes the target version"},old);
    await expect(submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...proof,requestKey:randomUUID(),rationale:"Obsolete review"})).rejects.toMatchObject({status:409});
    await reviewRegister(f,replacement);
    const rows=await withTransaction(db=>db.query("SELECT id,accepted_revision_id FROM execution_records WHERE id=ANY($1::uuid[])",[[first.id,replacement.id]]));
    expect(rows.rows.find(r=>r.id===first.id).accepted_revision_id).toBeNull();
    expect(rows.rows.find(r=>r.id===replacement.id).accepted_revision_id).toBe(replacement.revisionId);
    const linked=await withTransaction(db=>db.query(`SELECT d.revision_id,d.action FROM execution_review_decisions d WHERE request_key=(
      SELECT request_key FROM execution_review_decisions WHERE revision_id=$1 AND action='accept')`,[replacement.revisionId]));
    expect(linked.rows).toEqual(expect.arrayContaining([{revision_id:first.revisionId,action:"retract"},{revision_id:replacement.revisionId,action:"accept"}]));
  });
  it("keeps scope approval distinct from baseline acceptance and staffing decisions",async()=>{
    const f=await registerFixture(),record=await submitRegister(f,await saveRegister(f,scopeRecord(f.baselineId)));
    await reviewRegister(f,record);
    const old=(await readExecutionRecords(f.author,f.engagementId,{recordId:record.id})).records[0];
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...scopeRecord(f.baselineId),state:"approved_for_planning"},old)));
    expect((await readExecutionOverview(f.author,f.engagementId)).baselineId).toBe(f.baselineId);
    expect(await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM milestone_baselines WHERE engagement_id=$1",[f.engagementId])).rows[0].n)).toBe("1");
    await expect(saveRegister(f,{...scopeRecord(f.baselineId),state:"implemented",replacementBaselineId:f.baselineId})).rejects.toMatchObject({status:400});
    const before=await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM staffing_allocation_events event JOIN staffing_allocations allocation ON allocation.id=event.allocation_id WHERE allocation.customer_id=$1",[f.customerId])).rows[0].n);
    const current=(await readExecutionRecords(f.author,f.engagementId,{recordId:record.id})).records[0];
    await reviewRegister(f,await submitRegister(f,await saveRegister(f,{...scopeRecord(f.baselineId),state:"withdrawn"},current)));
    expect(await withTransaction(async db=>(await db.query("SELECT count(*) AS n FROM staffing_allocation_events event JOIN staffing_allocations allocation ON allocation.id=event.allocation_id WHERE allocation.customer_id=$1",[f.customerId])).rows[0].n)).toBe(before);
  });
});
