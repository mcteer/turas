import {executionLiveDomainDigests} from "../../scripts/execution-live-evidence";
import {expect,it} from "vitest";
import {withExecutionEvalEnvironment,requireOwnedExecutionClone} from "../../scripts/execution-eval-environment";
import {closeRuntimePool,query} from "../../lib/server/db/client";
import {buildExecutionLiveCase,executionLiveCaseIds} from "../fixtures/execution/advisory";
import {readExecutionSummary} from "../../lib/server/execution/summary";
it.each(executionLiveCaseIds)("builds governed %s evidence with an independent arithmetic oracle and no paid call",async id=>{
  requireOwnedExecutionClone();await closeRuntimePool();
  await withExecutionEvalEnvironment(async()=>{
    const f=await buildExecutionLiveCase(id);
    expect(Object.keys(await executionLiveDomainDigests()).length).toBeGreaterThan(30);
    const summary=await readExecutionSummary(f.author,f.engagementId,f.period);
    for(const [name,value] of Object.entries(f.expectedNumbers))expect((summary.effort as Record<string,unknown>)[name]).toBe(value);
    expect((await query("SELECT count(*)::int AS n FROM execution_advice_attempts")).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM execution_review_decisions WHERE action='accept' AND engagement_id=$1",[f.engagementId])).rows[0].n).toBeGreaterThan(0);
    if(id==="E04"){await f.withdraw();const after=await readExecutionSummary(f.reviewer,f.engagementId,f.period);expect(after.effort.actualLifetimeMinutes).toBe("60");}
    expect(JSON.stringify(summary)).not.toMatch(/PRIVATE_TIME_NOTE_SENTINEL|PRIVATE_EXECUTION_EVAL_PENDING|PRIVATE_EXECUTION_EVAL_PERSONNEL|91726354/);
  },{sourceDatabaseUrl:process.env.TURAS_TEST_SOURCE_DATABASE_URL});
},120000);
