import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createProfileTestSession } from "../profiles";
import { withSupportDatabase } from "./environment";
import { unknownSupportAssessment } from "./seed";
import { saveSupportProposal } from "../../../lib/server/support/service";
import { requireOwnedSupportClone } from "../../../scripts/support-eval-environment";
import { createSupportOutcomeEvidence } from "./outcome";
import { submitProfileCommand } from "../../../lib/server/profiles/service";
import { readSupportReadiness } from "../../../lib/server/support/projection";
import { runSupportCleanupTick } from "../../../lib/server/support/maintenance";

export async function createSupportRecoveryFixture(workflowRoot: string) {
  requireOwnedSupportClone();
  const actor = await withSupportDatabase(db => createProfileTestSession(db, "panel"));
  const customerId = randomUUID();
  await withSupportDatabase(db => db.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
    VALUES($1,$2,'Synthetic support recovery',true)`, [customerId, actor.workspaceId]));
  const command = { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
    workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [],
    content: unknownSupportAssessment() };
  const receipt = await saveSupportProposal(actor, customerId, command);
  const reviewer = await withSupportDatabase(db => createProfileTestSession(db, "mcteer"));
  const source = await createSupportOutcomeEvidence(actor, reviewer, customerId);
  const dependent = await saveSupportProposal(actor, customerId, { ...command, requestKey: randomUUID(),
    recordId: receipt.recordId, expectedVersion: 1, sourceRefs: [source.reference],
    content: { ...command.content, title: "WITHDRAWN_RECOVERY_PAYLOAD" } });
  const version = await withSupportDatabase(async db => Number((await db.query(`SELECT r.version FROM profile_records r
    JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1`, [source.reference.sourceRevisionId])).rows[0].version));
  await submitProfileCommand(reviewer, customerId, { action: "retract_revision", requestKey: randomUUID(),
    revisionId: source.reference.sourceRevisionId, expectedRecordVersion: version, rationale: "Human withdrew synthetic recovery evidence" });
  await mkdir(workflowRoot, { recursive: true, mode: 0o700 });
  const sentinel = join(workflowRoot, `support-recovery-${randomUUID()}.json`);
  await writeFile(sentinel, JSON.stringify({ synthetic: true, receiptId: receipt.id }), { mode: 0o600, flag: "wx" });
  const digest = async () => createHash("sha256").update(await readFile(sentinel)).digest("hex");
  const originalDigest = await digest();
  return { receipt, async verify() {
    requireOwnedSupportClone();
    if (await digest() !== originalDigest) throw new Error("Owned workflow state changed during restart");
    const replay = await saveSupportProposal(actor, customerId, command);
    if (JSON.stringify(replay) !== JSON.stringify(receipt)) throw new Error("Lost acknowledgement replay changed receipt identity");
    await withSupportDatabase(async db => {
      const counts = (await db.query(`SELECT
        (SELECT count(*)::int FROM support_records WHERE id=$1) AS records,
        (SELECT count(*)::int FROM support_revisions WHERE record_id=$1) AS revisions,
        (SELECT count(*)::int FROM support_command_receipts WHERE request_key=$2) AS receipts`, [receipt.recordId, command.requestKey])).rows[0];
      if (counts.records !== 1 || counts.revisions !== 2 || counts.receipts !== 1)
        throw new Error("Restart or lost acknowledgement created duplicate support state");
    });
    const view = await readSupportReadiness(actor, customerId, null, "delivery");
    if (JSON.stringify(view).includes("WITHDRAWN_RECOVERY_PAYLOAD")) throw new Error("Withdrawn recovery content was released");
    return { records: 1, revisions: 2, receipts: 1, workflowDigest: originalDigest, dependentWithheld: true };
  }, async purgeDependent() {
    requireOwnedSupportClone();
    // Advance only the owned queue's scheduling clock, never immutable history.
    await withSupportDatabase(async db => {
      if ((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [dependent.revisionId])).rowCount !== 1)
        throw new Error("Dependent payload was not retained before its purge deadline");
      await db.query("UPDATE support_cleanup_jobs SET due_at=clock_timestamp()-interval '1 second' WHERE revision_id=$1", [dependent.revisionId]);
    });
    await runSupportCleanupTick();
    await withSupportDatabase(async db => {
      if ((await db.query("SELECT 1 FROM support_payloads WHERE revision_id=$1", [dependent.revisionId])).rowCount !== 0)
        throw new Error("Dependent recovery payload was not purged");
      if ((await db.query("SELECT 1 FROM support_revisions WHERE id=$1", [dependent.revisionId])).rowCount !== 1)
        throw new Error("Dependent recovery identity was lost");
    });
    return true;
  } };
}
