import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect as baseExpect } from "@playwright/test";
import { requireOwnedSupportClone } from "../../scripts/support-eval-environment";
import { query } from "../../lib/server/db/client";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";
import { createProfileTestSession } from "../fixtures/profiles";
import { withSupportDatabase } from "../fixtures/support/environment";
import { unknownSupportAssessment } from "../fixtures/support/seed";
import { saveSupportProposal } from "../../lib/server/support/service";
import { createSupportReviewPreview, decideSupportRevision } from "../../lib/server/support/review";
import { withTransaction } from "../../lib/server/db/client";
import { createReviewedPlanWorkload, createRetrievedPlanEvidence } from "../fixtures/plans/journey";
import { submitProfileCommand } from "../../lib/server/profiles/service";
import { createSupportOutcomeEvidence } from "../fixtures/support/outcome";

const expect = baseExpect.configure({ timeout: 30000 });

async function fillDiscoveryAction(page: Parameters<typeof signIn>[0], title: string) {
  await page.getByLabel("Action Title", { exact: true }).fill(title);
  await page.getByLabel("Desired Outcome", { exact: true }).fill("Confirm missing operating evidence with the accountable human");
  await page.getByLabel("Action Rationale", { exact: true }).fill("Missing evidence requires verification, not invented certainty");
  await page.getByLabel("Validation Criterion", { exact: true }).fill("A human reviews an eligible operating record");
}

test.beforeEach(({ page }) => {
  requireOwnedSupportClone();
  if (process.env.TURAS_SUPPORT_UI_FIXTURE_READY !== "1") throw new Error("Use the owned support UI runner");
  page.setDefaultTimeout(30000);
});

test("empty customer readiness proposal and exact human review remain independent of engagement", async ({ page }, info) => {
  test.setTimeout(180000);
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic WebKit support',true)", [customerId, DEMO_IDS.workspace]);
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await expect(page.getByRole("heading", { name: "Support Guidance", exact: true })).toBeVisible();
  await expect(page.getByText("No accepted assessment. Missing operating evidence remains unknown.")).toBeVisible();
  await page.getByRole("button", { name: "Propose Readiness", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: / Status$/ })).toHaveCount(6);
  await page.getByLabel("Assessment Title", { exact: true }).fill("Synthetic reviewed operating unknowns");
  await page.getByRole("button", { name: "Save Proposed Assessment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Preview Assessment Review", exact: true })).toHaveCount(0);
  await expect(page.getByText("Synthetic reviewed operating unknowns", { exact: true })).toBeVisible();
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Preview Assessment Review", exact: true }).click();
  await page.getByLabel("Review Rationale", { exact: true }).fill("Human reviewed all six unknowns without fabricating operating evidence");
  await page.getByRole("button", { name: "Accept Revision", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Preview Accepted Assessment", exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("reviewed-support.png"), fullPage: true });
});

test("proposed action deferral preserves the accepted open disposition", async ({ page }, info) => {
  test.setTimeout(180000);
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic WebKit actions',true)", [customerId, DEMO_IDS.workspace]);
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action", exact: true }).click();
  await page.getByLabel("Action Title", { exact: true }).fill("Confirm synthetic operating ownership");
  await page.getByLabel("Desired Outcome", { exact: true }).fill("An accountable owner reviews the missing operating evidence");
  await page.getByLabel("Action Rationale", { exact: true }).fill("Operating ownership is unknown");
  await page.getByLabel("Validation Criterion", { exact: true }).fill("Review an accepted stakeholder source");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByText("Accepted Disposition: Not Accepted", { exact: true })).toBeVisible();
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Preview Action Review", exact: true }).click();
  await page.getByLabel("Review Rationale", { exact: true }).fill("Human reviewed this discovery action with explicit unknown ownership");
  await page.getByRole("button", { name: "Accept Revision", exact: true }).click();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action Revision", exact: true }).click();
  await page.getByRole("heading", { name: "Propose Action Revision", exact: true }).waitFor();
  await page.getByRole("combobox", { name: "Proposed Disposition", exact: true }).selectOption("deferred");
  const revisit = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Revisit Date", { exact: true }).fill(revisit);
  await page.getByLabel("Disposition or Reopening Rationale", { exact: true }).fill("Human proposes waiting for the stakeholder review");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByText("Pending Proposal: Deferred. Accepted state is unchanged.", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  expect(await page.getByRole("button", { name: "Preview Action Review", exact: true }).count()).toBe(0);
  await page.getByText("Action Details", { exact: true }).click();
  await expect(page.getByText("Completing this Turas action never resolves an external ticket or changes maturity or engagement acceptance.", { exact: true })).toBeVisible();
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("proposed-deferral.png"), fullPage: true });
});

test("unknown escalation route and human-reported handoff never imply an external action", async ({ page }, info) => {
  test.setTimeout(180000);
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic WebKit escalation',true)", [customerId, DEMO_IDS.workspace]);
  let externalRequests = 0;
  await page.route("https://support.example.invalid/**", route => { externalRequests++; return route.abort(); });
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action", exact: true }).click();
  await fillDiscoveryAction(page, "Verify the synthetic human escalation route");
  await page.getByRole("checkbox", { name: "Include Escalation Guidance", exact: true }).check();
  await page.getByLabel("Escalation Trigger", { exact: true }).fill("Human confirms a missing incident procedure");
  await page.getByLabel("Observed Impact", { exact: true }).fill("Impact is unknown pending human verification");
  await page.getByLabel("Accountable Role", { exact: true }).fill("Confirm the customer operating owner");
  await page.getByLabel("Evidence to Provide", { exact: true }).fill("Collect current operational observations and approved supporting records");
  await expect(page.getByRole("combobox", { name: "Escalation Route", exact: true })).toHaveValue("unknown");
  await page.getByRole("checkbox", { name: "Record Human-Reported Handoff", exact: true }).check();
  await page.getByLabel("External Reference", { exact: true }).fill("https://support.example.invalid/tickets/synthetic");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verify the synthetic human escalation route", exact: true })).toBeVisible();
  await page.getByText("Action Details", { exact: true }).click();
  await expect(page.getByText("Unknown Route: Confirm the established incident route", { exact: true })).toBeVisible();
  await expect(page.getByText("External acknowledgement: Unknown. External resolution: Unknown. No external action was performed.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "External Reference", exact: true })).toHaveAttribute("rel", "noopener noreferrer nofollow");
  expect(externalRequests).toBe(0);
  expect(await page.getByRole("button", { name: /send|resolve ticket/i }).count()).toBe(0);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(item => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("human-escalation.png"), fullPage: true });
});

test("assigned partner sees accepted delivery only and revoked direct navigation clears guidance", async ({ page }, info) => {
  test.setTimeout(180000);
  const customerId = randomUUID();
  const actors = await withSupportDatabase(async db => ({ panel: await createProfileTestSession(db, "panel"),
    reviewer: await createProfileTestSession(db, "mcteer"), partner: await createProfileTestSession(db, "partner") }));
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic partner support',true)", [customerId, DEMO_IDS.workspace]);
  for (const audience of ["delivery", "internal"] as const) {
    const content = unknownSupportAssessment();
    content.checks = content.checks.map(check => ({ ...check, rationale: audience === "internal" ? "INTERNAL_SUPPORT_PRIVATE_SENTINEL" : "DELIVERY_SUPPORT_ACCEPTED_SENTINEL" }));
    const saved = await saveSupportProposal(actors.panel, customerId, { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
      workloadId: null, expectedVersion: 0, audience, selectedEngagementIds: [], sourceRefs: [], content });
    const preview = await createSupportReviewPreview(actors.reviewer, customerId, { workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId });
    await decideSupportRevision(actors.reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(),
      workloadId: null, recordId: saved.recordId, revisionId: saved.revisionId, expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest,
      decision: "accept", rationale: "Human accepted the six scoped unknowns" });
  }
  const grantId = randomUUID();
  await query(`INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by)
    VALUES($1,$2,$3,$4,'active',1,$5)`, [grantId, actors.partner.membershipId, actors.partner.workspaceId, customerId, actors.reviewer.principalId]);
  await signIn(page, "partner");
  await page.goto(`/customers/${customerId}/support`);
  await expect(page.getByText("DELIVERY_SUPPORT_ACCEPTED_SENTINEL", { exact: true })).toHaveCount(6);
  expect(await page.getByText("INTERNAL_SUPPORT_PRIVATE_SENTINEL", { exact: true }).count()).toBe(0);
  expect(await page.getByRole("button", { name: /Propose|Ask Turi|Preview.*Review/ }).count()).toBe(0);
  await query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE id=$1", [grantId]);
  await page.goto(`/customers/${customerId}/support`);
  await expect(page.getByText("DELIVERY_SUPPORT_ACCEPTED_SENTINEL", { exact: true })).toHaveCount(0);
  expect(await page.getByText("INTERNAL_SUPPORT_PRIVATE_SENTINEL", { exact: true }).count()).toBe(0);
  await page.screenshot({ path: info.outputPath("revoked-partner-support.png"), fullPage: true });
});

test("lost save acknowledgement reconciles the same request without another proposal", async ({ page }, info) => {
  test.setTimeout(180000);
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic support acknowledgement',true)", [customerId, DEMO_IDS.workspace]);
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  let posts = 0;
  await page.route(`**/api/support/customers/${customerId}/commands`, async route => {
    posts++;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await response.dispose();
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "Propose Readiness", exact: true }).click();
  await page.getByLabel("Assessment Title", { exact: true }).fill("Synthetic acknowledgement retained");
  await page.getByRole("button", { name: "Save Proposed Assessment", exact: true }).click();
  await expect(page.getByText("Synthetic acknowledgement retained", { exact: true })).toBeVisible();
  expect(posts).toBe(1);
  const counts = (await query(`SELECT (SELECT count(*)::int FROM support_records WHERE customer_id=$1) AS records,
    (SELECT count(*)::int FROM support_revisions v JOIN support_records r ON r.id=v.record_id WHERE r.customer_id=$1) AS revisions`, [customerId])).rows[0];
  expect(counts).toEqual({ records: 1, revisions: 1 });
  await page.screenshot({ path: info.outputPath("reconciled-support.png"), fullPage: true });
});

test("original source withdrawal withholds accepted readiness before cleanup", async ({ page }, info) => {
  test.setTimeout(210000);
  const actors = await withSupportDatabase(async db => ({ panel: await createProfileTestSession(db, "panel"), reviewer: await createProfileTestSession(db, "mcteer") }));
  const customerId = DEMO_IDS.sharedCustomer;
  const workloadId = await withTransaction(db => createReviewedPlanWorkload(db, actors.panel, actors.reviewer, customerId));
  const source = await createRetrievedPlanEvidence(actors.panel, actors.reviewer, customerId, workloadId);
  const content = unknownSupportAssessment();
  content.checks = content.checks.map(check => ({ ...check, rationale: "WITHDRAWN_SUPPORT_BROWSER_SENTINEL" }));
  const saved = await saveSupportProposal(actors.panel, customerId, { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
    workloadId, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [source.reference], content });
  const preview = await createSupportReviewPreview(actors.reviewer, customerId, { workloadId, recordId: saved.recordId, revisionId: saved.revisionId });
  await decideSupportRevision(actors.reviewer, customerId, { contractVersion: "support-v1", operation: "review_revision", requestKey: randomUUID(), workloadId,
    recordId: saved.recordId, revisionId: saved.revisionId, expectedVersion: preview.expectedVersion, sourceDigest: preview.sourceDigest,
    decision: "accept", rationale: "Human reviewed the exact original source and explicit unknowns" });
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("combobox", { name: "Workload", exact: true }).selectOption(workloadId);
  await expect(page.getByText("WITHDRAWN_SUPPORT_BROWSER_SENTINEL", { exact: true })).toHaveCount(6);
  const version = Number((await query(`SELECT r.version FROM profile_records r JOIN profile_revisions v ON v.record_id=r.id WHERE v.id=$1`, [source.reviewedRevisionId])).rows[0].version);
  await submitProfileCommand(actors.reviewer, customerId, { action: "retract_revision", requestKey: randomUUID(), revisionId: source.reviewedRevisionId,
    expectedRecordVersion: version, rationale: "Human withdrew the synthetic original source" });
  await page.getByRole("button", { name: "Refresh Guidance", exact: true }).click();
  await expect(page.getByText("WITHDRAWN_SUPPORT_BROWSER_SENTINEL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Evidence changed or content was withdrawn. Review required; guidance is withheld.", { exact: true })).toBeVisible();
  expect(Number((await query("SELECT count(*)::int AS count FROM support_payloads WHERE revision_id=$1", [saved.revisionId])).rows[0].count)).toBe(1);
  await page.screenshot({ path: info.outputPath("withdrawn-support-source.png"), fullPage: true });
});

test("a competing revision makes the browser exact-review acknowledgement stale", async ({ page }, info) => {
  test.setTimeout(180000);
  const actors = await withSupportDatabase(async db => ({ panel: await createProfileTestSession(db, "panel"), reviewer: await createProfileTestSession(db, "mcteer") }));
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic stale support review',true)", [customerId, DEMO_IDS.workspace]);
  const content = unknownSupportAssessment();
  const saved = await saveSupportProposal(actors.panel, customerId, { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
    workloadId: null, expectedVersion: 0, audience: "delivery", selectedEngagementIds: [], sourceRefs: [], content });
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Preview Assessment Review", exact: true }).click();
  await page.getByLabel("Review Rationale", { exact: true }).fill("Human attempts acceptance against the displayed exact preview");
  let reviewPosts = 0, status = 0;
  await page.route(`**/api/support/customers/${customerId}/commands`, async route => {
    if (route.request().postDataJSON().operation === "review_revision") {
      reviewPosts++;
      await saveSupportProposal(actors.panel, customerId, { contractVersion: "support-v1", operation: "save_assessment", requestKey: randomUUID(),
        recordId: saved.recordId, workloadId: null, expectedVersion: 1, audience: "delivery", selectedEngagementIds: [], sourceRefs: [],
        content: { ...content, title: "Synthetic competing revision" } });
      const response = await route.fetch();
      status = response.status();
      await route.fulfill({ response });
      await response.dispose();
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Accept Revision", exact: true }).click();
  await expect.poll(() => status).toBe(409);
  expect(reviewPosts).toBe(1);
  const row = (await query("SELECT accepted_revision_id FROM support_records WHERE id=$1", [saved.recordId])).rows[0];
  expect(row.accepted_revision_id).toBeNull();
  expect(Number((await query("SELECT count(*)::int AS count FROM support_review_decisions WHERE record_id=$1", [saved.recordId])).rows[0].count)).toBe(0);
  await page.screenshot({ path: info.outputPath("stale-support-review.png"), fullPage: true });
});

test("completion needs outcome evidence and dismissed actions reopen only through reviewed proposals", async ({ page }, info) => {
  test.setTimeout(210000);
  const customerId = randomUUID();
  await query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic completion and reopening',true)", [customerId, DEMO_IDS.workspace]);
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action", exact: true }).click();
  await fillDiscoveryAction(page, "Synthetic reviewed reopening action");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  async function accept() {
    await page.getByRole("button", { name: "Preview Action Review", exact: true }).click();
    await page.getByLabel("Review Rationale", { exact: true }).fill("Human reviewed the exact synthetic action disposition");
    await page.getByRole("button", { name: "Accept Revision", exact: true }).click();
  }
  await accept();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Propose Action Revision", exact: true }).click();
  await page.getByRole("combobox", { name: "Proposed Disposition", exact: true }).selectOption("dismissed");
  await page.getByLabel("Disposition or Reopening Rationale", { exact: true }).fill("Human determined the initial discovery is not needed");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await accept();
  await expect(page.getByText("Accepted Disposition: Dismissed", { exact: true })).toBeVisible();
  await signIn(page, "panel");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action Revision", exact: true }).click();
  await page.getByRole("combobox", { name: "Proposed Disposition", exact: true }).selectOption("completed");
  await page.getByLabel("Completion Date", { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Dated outcome evidence required" })).toBeVisible();
  await expect(page.getByText("Accepted Disposition: Dismissed", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Proposed Disposition", exact: true }).selectOption("open");
  await page.getByRole("textbox", { name: "Disposition or Reopening Rationale", exact: true }).fill("Human observations require renewed operating discovery");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByText("Pending Proposal: Open. Accepted state is unchanged.", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted Disposition: Dismissed", { exact: true })).toBeVisible();
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await accept();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("reviewed-reopening.png"), fullPage: true });
});

test("dated outcome selection and exact review make a proposed completion accepted", async ({ page }, info) => {
  test.setTimeout(210000);
  const actors = await withSupportDatabase(async db => ({ panel: await createProfileTestSession(db, "panel"), reviewer: await createProfileTestSession(db, "mcteer") }));
  const customerId = DEMO_IDS.sharedCustomer;
  await createSupportOutcomeEvidence(actors.panel, actors.reviewer, customerId);
  await signIn(page, "mcteer");
  await page.goto(`/customers/${customerId}/support`);
  await page.getByRole("button", { name: "Propose Action", exact: true }).click();
  await fillDiscoveryAction(page, "Synthetic evidenced completion");
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  async function accept() {
    await page.getByRole("button", { name: "Preview Action Review", exact: true }).click();
    await page.getByRole("textbox", { name: "Review Rationale", exact: true }).fill("Human reviewed the exact dated synthetic operating outcome");
    await page.getByRole("button", { name: "Accept Revision", exact: true }).click();
  }
  await accept();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Propose Action Revision", exact: true }).click();
  await page.getByRole("combobox", { name: "Proposed Disposition", exact: true }).selectOption("completed");
  await page.getByRole("textbox", { name: "Completion Date", exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page.getByRole("textbox", { name: "Evidence Search", exact: true }).fill("synthetic operating ownership verification outcome");
  await page.getByRole("button", { name: "Find Eligible Evidence", exact: true }).click();
  await page.getByRole("button", { name: "Select Evidence", exact: true }).click();
  await page.getByRole("group", { name: "Dated Outcome Evidence", exact: true }).getByRole("checkbox", { name: "Evidence 1", exact: true }).check();
  await page.getByRole("button", { name: "Save Proposed Action", exact: true }).click();
  await expect(page.getByText("Pending Proposal: Completed. Accepted state is unchanged.", { exact: true })).toBeVisible();
  await expect(page.getByText("Accepted Disposition: Open", { exact: true })).toBeVisible();
  await accept();
  await expect(page.getByText("Accepted Disposition: Completed", { exact: true })).toBeVisible();
  await page.getByText("Action Details", { exact: true }).click();
  await expect(page.getByText("Completing this Turas action never resolves an external ticket or changes maturity or engagement acceptance.", { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("evidenced-support-completion.png"), fullPage: true });
});
