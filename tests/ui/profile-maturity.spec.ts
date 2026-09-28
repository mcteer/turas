import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test("maturity proposal keeps all six dimensions separate from the journey stage", async ({ page }) => {
  await signIn(page, "panel");
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
  await page.getByLabel("Record type").selectOption("maturity_assessment");
  await expect(page.getByRole("heading", { name: "Independent maturity dimensions" })).toBeVisible();
  await expect(page.locator(".profile-dimensions fieldset")).toHaveCount(6);
  await page.getByLabel("Journey stage").selectOption("Accelerate");
  await expect(page.getByLabel("Journey stage")).toHaveValue("Accelerate");
  for (const key of ["outcome ownership", "delivery collaboration", "experience adoption",
    "operational trust", "platform organization", "innovation ai"]) {
    await expect(page.getByRole("group", { name: key }).getByLabel("State")).toHaveValue("Unknown");
  }
  await expect(page.getByText("No accepted facts yet")).toBeVisible();
});

test("a known dimension cannot be saved without reviewed support", async ({ page }) => {
  await signIn(page, "panel");
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
  const form = page.locator(".profile-form");
  await form.getByLabel("Record type").selectOption("maturity_assessment");
  const date = (offset: number) => new Date(Date.now() + offset * 86_400_000)
    .toISOString().slice(0, 16);
  await form.getByLabel("Observation start").fill(date(-20));
  await form.getByLabel("Observation end").fill(date(-5));
  await form.getByLabel("Review due").fill(date(20));
  await form.getByLabel("Assessor").fill("Synthetic maturity assessor");
  await form.getByLabel("Assessment rationale").fill("One proposed dimension lacks reviewed support");
  await form.getByLabel("Next capability", { exact: true }).fill("Gather verified evidence");
  const dimensions = form.locator(".profile-dimensions fieldset");
  for (const fieldset of await dimensions.all()) {
    await fieldset.getByLabel("rationale").fill("Missing current evidence");
    await fieldset.getByLabel("next Capability").fill("Collect current evidence");
  }
  await dimensions.first().getByLabel("State").selectOption("Emerging");
  await form.getByRole("button", { name: "Save as Pending" }).click();
  await expect(form.getByRole("status")).toContainText("Known dimensions require eligible evidence");
  await expect(form.getByRole("button", { name: "Save as Pending" })).toBeEnabled();
});

test("a seeded assessment shows six independent states and attributed source detail", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-demo for the local synthetic journey");
  await signIn(page, "mcteer");
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  await expect(page.getByRole("heading", { name: "Maturity", exact: true })).toBeVisible();
  const product = page.locator('section[aria-labelledby="profile-product_use"] .profile-card')
    .filter({ has: page.getByRole("heading", { name: "Synthetic deployment product" }) });
  await expect(product).toContainText("state: actual");
  await expect(product).toContainText("Used for a fictional public web workload");
  await expect(product).toContainText("observed at:");
  const assessment = page.locator(".profile-maturity-card");
  await expect(assessment.getByRole("heading", { name: "Journey stage Unknown" })).toBeVisible();
  await expect(assessment).toContainText("Scope: Customer-wide");
  await expect(assessment.locator(".profile-maturity-dimension")).toHaveCount(6);
  await expect(assessment.locator(".profile-maturity-dimension", { hasText: "Emerging" })).toHaveCount(2);
  await expect(assessment.locator(".profile-maturity-dimension", { hasText: "Unknown" })).toHaveCount(4);
  await expect(page.getByRole("heading", { name: "Engagements", exact: true })).toHaveCount(0);
  await page.locator('section[aria-labelledby="profile-maturity_assessment"]')
    .getByRole("button", { name: "View history" }).click();
  await expect(page.getByRole("heading", { name: "Record history" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Record history" })).toContainText("Scope: Customer-wide");
  await expect(page.locator(".profile-history-list").first().locator("li")).toHaveCount(1);
  await expect(page.locator(".profile-history-list").first()).toContainText("Accepted");
  await expect(page.getByRole("heading", { name: "Review and lifecycle events" })).toBeVisible();
  await expect(page.locator(".profile-history-list").last()).toContainText("accept");
  await page.getByRole("button", { name: "Close history" }).click();
  await page.getByRole("button", { name: "View source" }).click();
  await expect(page.getByRole("heading", { name: "Source detail" })).toBeVisible();
  await expect(page.getByText("A fictional platform documents deployment review checks")).toBeVisible();
});

test("a seeded maturity correction stays Pending and preserves its delivery audience", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-demo for the local synthetic journey");
  await signIn(page, "mcteer");
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  const form = page.locator(".profile-form");
  await form.getByLabel("Record type").selectOption("maturity_assessment");
  await form.locator(".profile-correction-options button").first().click();
  await expect(form.getByLabel("Requested audience")).toHaveValue("delivery");
  await expect(form.getByLabel("Assessment rationale")).toHaveValue(/Two dimensions have cited synthetic support/);
  await expect(form.getByLabel("Observation end")).toHaveValue(/2026-09-20/);
  await expect(form.locator(".profile-dimensions fieldset")).toHaveCount(6);
  const correction = `Synthetic corrected maturity ${randomUUID().slice(0, 8)}`;
  await form.getByLabel("Assessment rationale").fill(correction);
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/api/customers/${DEMO_IDS.deniedCustomer}/commands`, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify({ data: { reviewState: "pending" } }) });
  });
  await form.getByRole("button", { name: "Save as Pending" }).click();
  await expect(form.getByRole("status")).toContainText("Proposal saved as Pending");
  expect(submitted).toMatchObject({ action: "propose_revision", requestedAudience: "delivery",
    dataCategory: "delivery_context", expectedRecordVersion: 1,
    payload: { rationale: correction, rubricVersion: "customer-maturity-v1" } });
  await expect(page.locator(".profile-maturity-card")).toContainText("Two dimensions have cited synthetic support");
  await expect(page.locator(".profile-maturity-card")).not.toContainText(correction);
  await page.locator('section[aria-labelledby="profile-maturity_assessment"]')
    .getByRole("button", { name: "View history" }).click();
  await expect(page.getByRole("region", { name: "Record history" })).toContainText("Accepted");
});

test("six distinct maturity states display without inferring a journey stage from products", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-demo for the local synthetic journey");
  await signIn(page, "mcteer");
  const states = ["Unknown", "Emerging", "Established", "Measured", "Scaled", "Adaptive"];
  await page.route(`**/api/customers/${DEMO_IDS.deniedCustomer}/profile*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { data: { acceptedFacts: { kind: string;
      payload: Record<string, unknown> }[] } };
    const maturity = body.data.acceptedFacts.find((fact) => fact.kind === "maturity_assessment");
    if (!maturity) throw new Error("Synthetic maturity fixture missing");
    const dimensions = maturity.payload.dimensions as Record<string, unknown>[];
    maturity.payload.dimensions = dimensions.map((dimension, index) => ({ ...dimension,
      state: states[index], rationale: index === 0 ? "Missing current evidence" :
        `Synthetic evidence for ${states[index]}` }));
    delete maturity.payload.journeyStage;
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  const assessment = page.locator(".profile-maturity-card");
  await expect(assessment.getByRole("heading", { name: "Journey stage Unknown" })).toBeVisible();
  await expect(assessment).toContainText("customer-maturity-v1");
  await expect(assessment).toContainText("Scope: Customer-wide");
  await expect(assessment).toContainText("Assessed by Synthetic review team");
  await expect(assessment).toContainText("Observed");
  await expect(assessment).toContainText("Review");
  for (const [index, state] of states.entries()) {
    await expect(assessment.locator(".profile-maturity-dimension").nth(index)
      .locator(".profile-badge")).toHaveText(state);
  }
  await expect(page.locator('section[aria-labelledby="profile-product_use"]')
    .getByRole("heading", { name: "Synthetic deployment product" })).toBeVisible();
});
