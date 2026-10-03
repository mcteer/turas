import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { query } from "../../lib/server/db/client";
import { createOwnedConversation } from "../../lib/server/conversations/repository";
import { prepareExecutionAdvice } from "../../lib/server/execution/advisory";
import { readExecutionOverview } from "../../lib/server/execution/service";
import { settleDueExecutionAdvisories } from "../../lib/server/execution/maintenance";
import { registerFixture } from "../fixtures/execution/registers";

it("expires only due reservations and preserves unknown native usage through disabled metadata maintenance", async () => {
  const f = await registerFixture(), view = await readExecutionOverview(f.author, f.engagementId);
  const reserve = async () => {
    const chat = await createOwnedConversation(f.author, { customerId:f.customerId,requestKey:randomUUID(),title:"Lifecycle fixture" });
    return prepareExecutionAdvice(f.author,f.engagementId,{requestKey:randomUUID(),conversationId:chat.conversation.id,
      expectedGeneration:view.generation,from:"2026-10-02",to:"2026-10-02"});
  };
  const due = await reserve(), fresh = await reserve(), unknown = await reserve();
  await query("UPDATE execution_advice_attempts SET created_at=clock_timestamp()-interval '6 minutes' WHERE id=$1",[due.attemptId]);
  // Metadata fixture, not a native transport proof. Native restart is exercised
  // separately using the actual Eve provider receipt and selected owned stores.
  await query(`UPDATE execution_advice_attempts SET state='running',dispatch_at=clock_timestamp()-interval '121 seconds',deadline_at=clock_timestamp()-interval '1 second' WHERE id=$1`,[unknown.attemptId]);
  const disabledBefore = process.env.TURAS_008_DISABLED;
  process.env.TURAS_008_DISABLED = "1";
  try {
    await query("UPDATE login_sessions SET revoked_at=clock_timestamp() WHERE id=$1",[f.author.sessionId]);
    expect(await settleDueExecutionAdvisories()).toBe(2);
    expect(await settleDueExecutionAdvisories()).toBe(0);
    const states = (await query("SELECT id,state,failure_code FROM execution_advice_attempts WHERE id=ANY($1::uuid[])",[[due.attemptId,fresh.attemptId,unknown.attemptId]])).rows;
    expect(states.find(r=>r.id===due.attemptId)).toMatchObject({state:"expired",failure_code:"request_expired"});
    expect(states.find(r=>r.id===fresh.attemptId)).toMatchObject({state:"prepared"});
    expect(states.find(r=>r.id===unknown.attemptId)).toMatchObject({state:"unconfirmed",failure_code:"native_completion_unconfirmed"});
    expect((await query("SELECT count(*)::int AS n FROM execution_advice_usage")).rows[0].n).toBe(0);
    expect((await query("SELECT count(*)::int AS n FROM response_attempts")).rows[0].n).toBe(0);
  } finally { if (disabledBefore === undefined) delete process.env.TURAS_008_DISABLED; else process.env.TURAS_008_DISABLED=disabledBefore; }
});
