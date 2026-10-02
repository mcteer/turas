import { createHash, randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { withTransaction } from "../../lib/server/db/client";
import { createProfileTestSession } from "../fixtures/profiles";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { WorkforceStore } from "../../lib/server/staffing/store";
import { claimWorkforceImport, publishWorkforceImport } from "../../lib/server/staffing/jobs";
import { runWorkforceImport } from "../../lib/server/staffing/runner";
import { runWorkforceCleanupTick } from "../../lib/server/staffing/cleanup";
import { retireImport } from "../../lib/server/staffing/lifecycle";
import { parseWorkforceTable } from "../../packages/artifact-extractor/src/main";
import { staffingSha256 } from "../../lib/server/staffing/commands";
import { createImportIntent, uploadImportOriginal, completeImport, readImportOriginal } from "../../lib/server/staffing/imports";

async function* chunks(bytes: Buffer) { yield bytes.subarray(0, 4); yield bytes.subarray(4); }
describe("bounded private workforce original admission", () => {
  it("rejects chunked overrun and mismatched environment stores without retaining staged bytes", async () => {
    requireOwnedStaffingClone();
    const store = new WorkforceStore();
    const before = await readdir(`${store.root}/staged`).catch(() => []);
    await expect(store.stage(chunks(Buffer.from("oversized")), 4)).rejects.toMatchObject({ status: 413 });
    expect(await readdir(`${store.root}/staged`)).toEqual(before);
    await expect(new WorkforceStore(store.root, "foreign-environment").stage(chunks(Buffer.from("test")), 4))
      .rejects.toMatchObject({ status: 503 });
  });
  it("binds actual bytes and refuses unscanned original reads or operational admission", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const panel = await withTransaction(db => createProfileTestSession(db, "panel"));
    const bytes = Buffer.from("resource,skill\nsynthetic,web\n"), digest = createHash("sha256").update(bytes).digest("hex");
    const request = { requestKey: randomUUID(), filename: "synthetic.csv", format: "csv", byteSize: bytes.length, contentDigest: digest };
    await expect(createImportIntent(panel, request)).rejects.toMatchObject({ status: 403 });
    const intent = await createImportIntent(actor, request);
    expect(await createImportIntent(actor, request)).toEqual(intent);
    await expect(uploadImportOriginal(actor, intent.importId!, chunks(Buffer.concat([bytes, Buffer.from("extra")]))))
      .rejects.toMatchObject({ status: 413 });
    await uploadImportOriginal(actor, intent.importId!, chunks(bytes));
    const complete = { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: intent.generation };
    const result = await completeImport(actor, intent.importId!, complete);
    expect(await completeImport(actor, intent.importId!, complete)).toEqual(result);
    expect(result.state).toBe("quarantined");
    await expect(readImportOriginal(actor, intent.importId!)).rejects.toMatchObject({ status: 404 });
    await expect(readImportOriginal(panel, intent.importId!)).rejects.toMatchObject({ status: 403 });
  });  it("publishes only an actual clean scan and fences originals immediately on withdrawal", async () => {
    requireOwnedStaffingClone();
    // The earlier finalized intent is the oldest queued source in this owned clone.
    const claim = await claimWorkforceImport(); expect(claim).not.toBeNull();
    await runWorkforceImport(claim!);
    const status = await withTransaction(async db => (await db.query("SELECT state,error_code FROM workforce_import_jobs WHERE id=$1", [claim!.jobId])).rows[0]);
    expect(status).toEqual({ state: "ready", error_code: null });
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const intent = await withTransaction(async db => (await db.query("SELECT id FROM workforce_import_intents WHERE source_id=$1", [claim!.sourceId])).rows[0]);
    const original = await readImportOriginal(actor, intent.id);
    expect(original.bytes.toString()).toContain("synthetic,web");
    const retired = await retireImport(actor, intent.id, { requestKey: randomUUID(),
      sourceGeneration: claim!.generation, rationale: "Withdraw synthetic original" }, "withdraw");
    expect(retired.generation).toBe(2);
    await expect(readImportOriginal(actor, intent.id)).rejects.toMatchObject({ status: 404 });
    expect((await withTransaction(db => db.query("SELECT revision_id FROM workforce_source_payloads WHERE revision_id=$1", [claim!.sourceVersionId]))).rowCount).toBe(1);
    await withTransaction(async db => {
      await db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=(SELECT owner_session_id FROM workforce_sources WHERE id=$1)", [claim!.sourceId]);
    });
    await runWorkforceCleanupTick();
    expect((await withTransaction(db => db.query("SELECT revision_id FROM workforce_source_payloads WHERE revision_id=$1", [claim!.sourceVersionId]))).rowCount).toBe(0);
    expect((await withTransaction(db => db.query("SELECT id FROM workforce_source_versions WHERE id=$1", [claim!.sourceVersionId]))).rowCount).toBe(1);
    expect((await withTransaction(db => db.query("SELECT state FROM workforce_sources WHERE id=$1", [claim!.sourceId]))).rows[0].state).toBe("deleted");
  }, 120_000);
  it("rejects publication after uploader revocation without admitting any extraction", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const bytes = Buffer.from("resource,skill\nsynthetic,web\n"), digest = createHash("sha256").update(bytes).digest("hex");
    const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "revocation.csv", format: "csv",
      byteSize: bytes.length, contentDigest: digest });
    await uploadImportOriginal(actor, intent.importId!, chunks(bytes));
    await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: 1 });
    const claim = await claimWorkforceImport(); expect(claim?.sourceId).toBe(intent.sourceId);
    const receipt = { contract: "artifact-intake-v1", originalDigest: digest, engineVersion: "synthetic-only",
      signatureVersion: "synthetic", scanPolicyVersion: "004-scan-v1", scannedAt: new Date().toISOString(), result: "clean" };
    const result = await parseWorkforceTable(bytes, "revocation.csv", "text/csv", { imageDigest: claim!.parserImageDigest,
      scanReceiptDigest: staffingSha256(receipt) });
    await withTransaction(db => db.query("UPDATE login_sessions SET revoked_at=now() WHERE id=$1", [actor.sessionId]));
    await expect(publishWorkforceImport(claim!, result, receipt)).rejects.toMatchObject({ status: 401 });
    expect((await withTransaction(db => db.query("SELECT id FROM workforce_extractions WHERE source_version_id=$1", [claim!.sourceVersionId]))).rowCount).toBe(0);
  });
  it("cancels a leased source while disabled and refuses its late publication", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const bytes = Buffer.from("resource,skill\nsynthetic,web\n"), digest = createHash("sha256").update(bytes).digest("hex");
    const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "cancel.csv", format: "csv",
      byteSize: bytes.length, contentDigest: digest });
    await uploadImportOriginal(actor, intent.importId!, chunks(bytes));
    await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: 1 });
    const claim = await claimWorkforceImport(); expect(claim?.sourceId).toBe(intent.sourceId);
    const receipt = { contract: "artifact-intake-v1", originalDigest: digest, engineVersion: "synthetic-only",
      signatureVersion: "synthetic", scanPolicyVersion: "004-scan-v1", scannedAt: new Date().toISOString(), result: "clean" };
    const result = await parseWorkforceTable(bytes, "cancel.csv", "text/csv", { imageDigest: claim!.parserImageDigest,
      scanReceiptDigest: staffingSha256(receipt) });
    const prior = process.env.TURAS_007_DISABLED; process.env.TURAS_007_DISABLED = "1";
    try {
      await retireImport(actor, intent.importId!, { requestKey: randomUUID(), sourceGeneration: 1,
        rationale: "Cancel synthetic in-flight parse" }, "cancel");
      expect(await claimWorkforceImport()).toBeNull();
    } finally { if (prior === undefined) delete process.env.TURAS_007_DISABLED; else process.env.TURAS_007_DISABLED = prior; }
    await expect(publishWorkforceImport(claim!, result, receipt)).rejects.toMatchObject({ status: 409 });
    expect((await withTransaction(db => db.query("SELECT id FROM workforce_extractions WHERE source_version_id=$1", [claim!.sourceVersionId]))).rowCount).toBe(0);
  });
  it("blocks the actual EICAR canary before parsing or original publication", async () => {
    requireOwnedStaffingClone();
    const actor = await withTransaction(db => createProfileTestSession(db, "mcteer"));
    const bytes = Buffer.from(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!", "$H+H*"].join(""), "ascii");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const intent = await createImportIntent(actor, { requestKey: randomUUID(), filename: "unsafe.csv", format: "csv",
      byteSize: bytes.length, contentDigest: digest });
    await uploadImportOriginal(actor, intent.importId!, chunks(bytes));
    await completeImport(actor, intent.importId!, { requestKey: randomUUID(), contentDigest: digest, sourceGeneration: 1 });
    const claim = await claimWorkforceImport(); expect(claim?.sourceId).toBe(intent.sourceId);
    await runWorkforceImport(claim!);
    expect((await withTransaction(db => db.query("SELECT state,error_code FROM workforce_import_jobs WHERE id=$1", [claim!.jobId]))).rows[0])
      .toEqual({ state: "failed", error_code: "unsafe_content" });
    await expect(readImportOriginal(actor, intent.importId!)).rejects.toMatchObject({ status: 404 });
    expect((await withTransaction(db => db.query("SELECT id FROM workforce_extractions WHERE source_version_id=$1", [claim!.sourceVersionId]))).rowCount).toBe(0);
  }, 120_000);

});
