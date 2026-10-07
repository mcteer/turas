import { randomUUID, createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { withSupportDatabase } from "../fixtures/support/environment";
import { createProfileTestSession } from "../fixtures/profiles";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { saveSupportProposal } from "../../lib/server/support/service";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import type { CurrentSession } from "../../lib/server/auth/sessions";
import { getServerConfig } from "../../lib/server/config";
import { supportKeyHashes, readSupportReceipt, enforceSupportRate } from "../../lib/server/support/commands";
import { createSupportReviewPreview } from "../../lib/server/support/review";
import { expireSupportReceipts } from "../../lib/server/support/maintenance";

describe("support proposal authority and retry", () => {
  let panel: CurrentSession, partner: CurrentSession;
  beforeAll(async () => {
    ({ panel, partner } = await withSupportDatabase(async db => ({
      panel: await createProfileTestSession(db, "panel"), partner: await createProfileTestSession(db, "partner"),
    })));
  });
  const command = () => ({ contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
    workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [],
    content: unknownSupportAssessment() });
  async function customer() {
    const id = randomUUID();
    await withSupportDatabase(db => db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic policy customer',true)", [id, DEMO_IDS.workspace]));
    return id;
  }
  it("saves only a proposal, and a same-key race creates one revision", async () => {
    const id = await customer(), input = command();
    const [first, replay] = await Promise.all([saveSupportProposal(panel, id, input), saveSupportProposal(panel, id, input)]);
    expect(first).toEqual(replay);
    expect(first.outcome).toBe("proposed");
    await withSupportDatabase(async db => {
      const row = (await db.query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [first.recordId])).rows[0];
      expect(row.accepted_revision_id).toBeNull();
      expect(Number((await db.query("SELECT count(*) AS count FROM support_revisions WHERE record_id=$1", [first.recordId])).rows[0].count)).toBe(1);
    });
    await expect(saveSupportProposal(panel, id, { ...input, content: { ...input.content, title: "Different content" } })).rejects.toMatchObject({ status: 409 });
  });
  it("allows eligible receipt replay while disabled, but refuses new work", async () => {
    const id = await customer(), input = command(), receipt = await saveSupportProposal(panel, id, input);
    const prior = process.env.TURAS_010_DISABLED;
    try {
      process.env.TURAS_010_DISABLED = "1";
      expect(await saveSupportProposal(panel, id, input)).toEqual(receipt);
      await expect(saveSupportProposal(panel, id, { ...input, requestKey: randomUUID(), recordId: receipt.recordId, expectedVersion: 1 })).rejects.toMatchObject({ status: 503 });
    } finally {
      if (prior === undefined) delete process.env.TURAS_010_DISABLED; else process.env.TURAS_010_DISABLED = prior;
    }
  });
  it("refuses partner proposals even for the assigned customer", async () => {
    await expect(saveSupportProposal(partner, DEMO_IDS.sharedCustomer, command())).rejects.toMatchObject({ status: 403 });
  });
  it("rechecks current session before replay", async () => {
    const local = await withSupportDatabase(db => createProfileTestSession(db, "panel"));
    const id = await customer(), input = command();
    await saveSupportProposal(local, id, input);
    await withSupportDatabase(db => db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [local.sessionId]));
    await expect(saveSupportProposal(local, id, input)).rejects.toMatchObject({ status: 401 });
  });
  it("does not recreate an expired request after retained-key rotation", async () => {
    const id = await customer(), input = command(), config = getServerConfig();
    const hash = supportKeyHashes([config.TURAS_ENVIRONMENT_ID, panel.workspaceId, panel.membershipId, input.requestKey],
      [config.TURAS_MAINTENANCE_SECRET])[0];
    await withSupportDatabase(db => db.query("INSERT INTO support_expired_command_keys(key_hash) VALUES($1)", [hash]));
    const previous = process.env.TURAS_010_RECEIPT_HASH_KEYS;
    try {
      process.env.TURAS_010_RECEIPT_HASH_KEYS = JSON.stringify(["rotated-synthetic-receipt-key-00000000", config.TURAS_MAINTENANCE_SECRET]);
      await expect(saveSupportProposal(panel, id, input)).rejects.toMatchObject({ status: 409, code: "expired_receipt" });
      await withSupportDatabase(async db => expect(Number((await db.query("SELECT count(*) AS count FROM support_records WHERE customer_id=$1", [id])).rows[0].count)).toBe(0));
    } finally {
      if (previous === undefined) delete process.env.TURAS_010_RECEIPT_HASH_KEYS; else process.env.TURAS_010_RECEIPT_HASH_KEYS = previous;
    }
  });
  it("rejects forged workspace authority and another customer's receipt lookup", async () => {
    const id = await customer(), input = command();
    const receipt = await saveSupportProposal(panel, id, input);
    expect((await readSupportReceipt(panel, input.requestKey)).recordId).toBe(receipt.recordId);
    await expect(saveSupportProposal({ ...panel, workspaceId: randomUUID() }, id, input)).rejects.toMatchObject({ status: 401 });
    await expect(saveSupportProposal(panel, await customer(), input)).rejects.toMatchObject({ status: 404 });
    await expect(readSupportReceipt(partner, input.requestKey)).rejects.toMatchObject({ status: 403 });
  });
  it("does not grant review to a different live administrator", async () => {
    const id = await customer(), input = command(), receipt = await saveSupportProposal(panel, id, input);
    await withSupportDatabase(db => db.query("UPDATE memberships SET role='admin' WHERE id=$1", [panel.membershipId]));
    try {
      await expect(createSupportReviewPreview({ ...panel, role: "admin" }, id,
        { workloadId: null, recordId: receipt.recordId, revisionId: receipt.revisionId })).rejects.toMatchObject({ status: 403 });
    } finally { await withSupportDatabase(db => db.query("UPDATE memberships SET role='member' WHERE id=$1", [panel.membershipId])); }
  });
  it("refuses a mismatched environment even on replay", async () => {
    const id = await customer(), input = command();
    await saveSupportProposal(panel, id, input);
    const prior = process.env.TURAS_ENVIRONMENT_ID;
    try {
      process.env.TURAS_ENVIRONMENT_ID = "test-other-support-environment";
      await expect(saveSupportProposal(panel, id, input)).rejects.toMatchObject({ status: 503 });
    } finally { process.env.TURAS_ENVIRONMENT_ID = prior; }
  });
  it("serializes receipt expiry with late admission and preserves opaque uniqueness", async () => {
    const id = await customer(), input = command(), receipt = await saveSupportProposal(panel, id, input);
    await withSupportDatabase(db => db.query("UPDATE support_command_receipts SET created_at=now()-interval '366 days' WHERE id=$1", [receipt.id]));
    const results = await Promise.allSettled([expireSupportReceipts(), saveSupportProposal(panel, id, input)]);
    expect(results[0].status).toBe("fulfilled");
    if (results[1].status === "fulfilled") expect(results[1].value).toEqual(receipt);
    else expect(results[1].reason).toMatchObject({ status: 409, code: "expired_receipt" });
    await expect(saveSupportProposal(panel, id, input)).rejects.toMatchObject({ status: 409, code: "expired_receipt" });
    await withSupportDatabase(async db => {
      expect(Number((await db.query("SELECT count(*) AS count FROM support_revisions WHERE record_id=$1", [receipt.recordId])).rows[0].count)).toBe(1);
      expect((await db.query("SELECT * FROM support_expired_command_keys LIMIT 1")).fields.map(field => field.name)).toEqual(["key_hash"]);
    });
  });
  it("admits exactly one concurrent last quota slot and caps denied counters", async () => {
    const config = getServerConfig();
    for (const kind of ["read", "write"] as const) {
      const actor = { ...panel, membershipId: randomUUID() }, limit = kind === "read" ? 60 : 30;
      const hash = createHmac("sha256", config.TURAS_MAINTENANCE_SECRET)
        .update(`support-v1:${actor.workspaceId}:${actor.membershipId}:${kind}`).digest("hex");
      const start = new Date(Math.floor(Date.now() / 60000) * 60000);
      await withSupportDatabase(db => db.query(`INSERT INTO rate_windows(environment_id,key_hash,category,window_start,count,expires_at)
        VALUES($1,$2,$3,$4,$5,$6)`, [config.TURAS_ENVIRONMENT_ID, hash, `support_${kind}`, start, limit - 1, new Date(start.getTime() + 60000)]));
      const results = await Promise.allSettled([withSupportDatabase(db => enforceSupportRate(db, actor, kind)),
        withSupportDatabase(db => enforceSupportRate(db, actor, kind))]);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const denied = results.find(result => result.status === "rejected");
      expect(denied?.status === "rejected" && denied.reason).toMatchObject({ status: 429, code: "rate_limited" });
      await expect(withSupportDatabase(db => enforceSupportRate(db, actor, kind))).rejects.toMatchObject({ status: 429 });
      await withSupportDatabase(async db => expect((await db.query("SELECT count FROM rate_windows WHERE environment_id=$1 AND key_hash=$2 AND window_start=$3",
        [config.TURAS_ENVIRONMENT_ID, hash, start])).rows[0].count).toBe(limit));
    }
  });
  it("denies runtime content-update privilege and preserves the proposal", async () => {
    const id = await customer(), saved = await saveSupportProposal(panel, id, command());
    await withSupportDatabase(async db => {
      // The disposable owner need not have cluster-level SET ROLE membership.
      // PostgreSQL evaluates the named role's actual effective column privilege,
      // including inherited/table-wide grants; do not broaden memberships here.
      expect((await db.query("SELECT has_column_privilege('turas_runtime','support_payloads','content','UPDATE') AS allowed"))
        .rows[0].allowed).toBe(false);
      expect((await db.query("SELECT content FROM support_payloads WHERE revision_id=$1", [saved.revisionId])).rows[0].content.contractVersion).toBe("support-v1");
    });
  });
});
