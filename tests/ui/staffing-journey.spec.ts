import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";
import { withTransaction } from "../../lib/server/db/client";
import { createReviewedStaffingJourneyInputs } from "../fixtures/staffing/journey";
import { resetStaffingFixtureRates } from "../fixtures/staffing/allocations";
import { signIn, sanitizedScreenshot } from "../fixtures/ui";

async function submit(page: Page, path: string, action: () => Promise<void>) {
  const response = page.waitForResponse(value => new URL(value.url()).pathname === path && value.request().method() === "POST");
  await action(); const value = await response; expect(value.status()).toBe(200);
  return (await value.json()).data;
}
async function accessible(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations.filter(value => ["serious", "critical"].includes(value.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
async function keyboard(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled(); await button.focus(); await page.keyboard.press("Enter");
}

test("source-bound reviewed journey through keyboard demand, match, human confirmation and entered forecast", async ({ page }, info) => {
  test.setTimeout(360_000); requireOwnedStaffingClone();
  if (process.env.TURAS_STAFFING_FIXTURE_READY !== "1") throw new Error("Use the owned staffing UI runner");
  await resetStaffingFixtureRates();
  // Actual scan/extraction/profile/shared-practice reviews and plan acceptance
  // are domain setup. Demand through finance below uses actual browser actions.
  const f = await createReviewedStaffingJourneyInputs();
  const path = `/customers/${f.customerId}/engagements/${f.accepted.engagementId}/staffing`;
  await signIn(page, "panel"); await page.goto(path); await keyboard(page, "Create demand");
  const draft = page.locator("form").filter({ has: page.getByRole("heading", { name: "Create demand", exact: true }) });
  await draft.getByLabel("Work package", { exact: true }).selectOption(f.content.workPackages[0].key);
  await draft.getByLabel("Demand title", { exact: true }).fill("Synthetic reviewed UI journey demand");
  await draft.getByLabel("Delivery role", { exact: true }).fill("Application delivery lead");
  await draft.getByLabel("First resource-local service date").fill(f.serviceDate);
  await draft.getByLabel("Last resource-local service date").fill(f.serviceDate);
  await draft.getByLabel(`Required minutes on ${f.serviceDate}`).fill("240");
  await draft.getByLabel("Planned billable work").check();
  await keyboard(page, "Add required skill");
  const skills = draft.getByLabel("Required skill 1", { exact: true });
  for (let i = 0; i < 50 && !await skills.locator(`option[value="${f.skill.skillId}"]`).count(); i++) {
    const count = await skills.locator("option").count(); await keyboard(page, "More skill choices");
    await expect.poll(() => skills.locator("option").count()).toBeGreaterThan(count);
  }
  await skills.selectOption(f.skill.skillId!); await draft.getByLabel("Minimum level for required skill 1").selectOption("2");
  await draft.getByLabel("Rationale", { exact: true }).fill("Exact actual reviewed baseline and imported resource");
  const demand = await submit(page, "/api/staffing/demands", () => keyboard(page, "Save demand draft"));
  await page.getByRole("button", { name: /Open demand 1/ }).click();
  await page.getByLabel("Demand action", { exact: true }).selectOption("qualify");
  await page.getByLabel("Action rationale").fill("Human qualification of exact accepted work package");
  await submit(page, `/api/staffing/demands/${demand.demandId}/qualify`, () => keyboard(page, "Apply demand action"));
  await expect(page.getByText("qualified · readable", { exact: true })).toBeVisible();
  await keyboard(page, "Compare resources");
  await expect(page.getByText(/comparison expires/)).toBeVisible();
  const choice = page.getByRole("button", { name: `Choose ${f.profile.displayName} for a proposal`, exact: true });
  for (let i = 0; i < 25 && !await choice.count(); i++) {
    const count = await page.getByRole("button", { name: /for a proposal$/ }).count();
    await keyboard(page, "More comparison results");
    await expect.poll(() => page.getByRole("button", { name: /for a proposal$/ }).count()).toBeGreaterThan(count);
  }
  await expect(choice.locator("..")).toContainText("Eligible · UTC"); await choice.focus(); await page.keyboard.press("Enter");
  await page.getByLabel(`Proposal minutes on ${f.serviceDate}`).fill("120");
  await page.getByLabel("Proposal rationale").fill("Human proposal after actual source-bound comparison");
  const allocation = await submit(page, "/api/staffing/allocations", () => keyboard(page, "Save proposal"));
  await expect(page.getByRole("button", { name: /Approve confirm/ })).toHaveCount(0); await accessible(page);
  await page.context().clearCookies(); await signIn(page, "mcteer"); await page.goto(path);
  await page.getByRole("button", { name: /Open demand 1/ }).click();
  await page.getByRole("button", { name: /Open allocation 1/ }).click();
  await page.getByLabel("Allocation action", { exact: true }).selectOption("confirm");
  await page.getByLabel("Allocation rationale", { exact: true }).fill("Review exact dated capacity and reviewed skills");
  await keyboard(page, "Prepare or save exact action");
  await expect(page.getByText(`${f.serviceDate}: 120 total confirmed resource minutes after approval`, { exact: true })).toBeVisible();
  await page.getByLabel("Decision rationale", { exact: true }).fill("Human current-source exact confirmation");
  const confirmed = await submit(page, `/api/staffing/allocations/${allocation.allocationId}/decisions`, () => keyboard(page, "Approve confirm"));
  expect(confirmed.state).toBe("confirmed"); await accessible(page);
  await page.goto("/staffing/finance");
  for (const [kind, rateKind, amount] of [["rate", "loaded_cost", "1000"], ["rate", "service", "2000"], ["contracted_revenue", "", "10000"], ["nonlabor", "", "500"]]) {
    const input = page.locator("form").filter({ has: page.getByRole("heading", { name: "Enter a finance input" }) });
    await input.getByLabel("Input kind").selectOption(kind);
    if (kind === "rate") { await input.getByLabel("Rate kind").selectOption(rateKind); await input.getByLabel("Canonical resource ID").fill(f.resource.resourceId!); }
    else { await input.getByLabel("Engagement ID", { exact: true }).fill(f.accepted.engagementId!); await input.getByLabel("Accepted baseline ID").fill(f.accepted.baselineId!); }
    await input.getByLabel("Currency", { exact: true }).selectOption("USD");
    await input.getByLabel("First effective date").fill(f.serviceDate); await input.getByLabel("End date (exclusive)").fill(f.end);
    await input.getByLabel(kind === "rate" ? "Rate (minor units per hour)" : "Entered total (minor units)").fill(amount);
    await input.getByLabel("Provenance reference").fill("Synthetic human entered UI journey reference");
    await input.getByLabel("Input rationale").fill("Explicit synthetic planning input");
    await submit(page, "/api/staffing/finance/inputs", () => keyboard(page, "Save entered finance input"));
  }
  await page.getByLabel("Policy approval rationale").fill("Human review of exact formula and planning input policy");
  await submit(page, "/api/staffing/finance/policy-decisions", () => keyboard(page, "Approve this planning formula and policy"));
  const customer = page.getByLabel("Scenario customer", { exact: true });
  for (let i = 0; i < 100 && !await customer.locator(`option[value="${f.customerId}"]`).count(); i++) {
    const count = await customer.locator("option").count(); await keyboard(page, "More scenario customer choices");
    await expect.poll(() => customer.locator("option").count()).toBeGreaterThan(count);
  }
  await customer.selectOption(f.customerId);
  const engagement = page.getByLabel("Scenario engagement", { exact: true });
  await expect(engagement.locator(`option[value="${f.accepted.engagementId}"]`)).toHaveCount(1); await engagement.selectOption(f.accepted.engagementId!);
  await page.getByLabel("Scenario currency").selectOption("USD"); await page.getByLabel("Scenario first date").fill(f.serviceDate);
  await page.getByLabel("Scenario last date (inclusive)").fill(f.serviceDate); await page.getByLabel("Scenario rationale").fill("Actual human-confirmed persisted minutes and entered inputs");
  const scenario = await submit(page, "/api/staffing/finance/scenarios", () => keyboard(page, "Create planning scenario"));
  const result = page.locator("article").filter({ has: page.getByRole("heading", { name: `Scenario ${scenario.scenarioId}`, exact: true }) });
  for (const amount of ["$100.00", "$5.00", "$20.00", "$75.00", "$40.00", "75.00%"]) await expect(result.getByText(amount, { exact: true })).toBeVisible();
  const persisted = await page.request.get(`/api/staffing/finance/scenarios/${scenario.scenarioId}`);
  expect(persisted.status()).toBe(200);
  expect((await persisted.json()).data.content).toMatchObject({ scope: { baselineId: f.accepted.baselineId }, deliveryCost: "2000", contribution: "7500", coverage: { confirmedMinutes: 120 }, policyApproval: "approved" });
  await withTransaction(async db => {
    expect((await db.query("SELECT current_accepted_revision_id FROM workforce_competencies WHERE id=$1", [f.workforce.competencyId])).rows[0].current_accepted_revision_id).toBe(f.workforce.competencyRevisionId);
    expect((await db.query("SELECT revision_id,minutes FROM staffing_allocation_days WHERE allocation_id=$1", [allocation.allocationId])).rows).toEqual([{ revision_id: allocation.revisionId, minutes: 120 }]);
  });
  await expect(page.getByText("PRIVATE_SYNTHETIC_JOURNEY_PERSONNEL_EVIDENCE", { exact: false })).toHaveCount(0);
  await accessible(page); await sanitizedScreenshot(page, `local-artifacts/007/journey-${info.project.name}.png`);
  await page.context().clearCookies(); await signIn(page, "panel");
  const denied = await page.request.get(`/api/staffing/finance/scenarios/${scenario.scenarioId}`); expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toMatch(/7500|10000|minorUnits|provenance|policyDecisionId/);
});
