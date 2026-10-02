import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test("an approved quality rating is copied into a Pending correction draft", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-demo for the local synthetic journey");
  await signIn(page, "mcteer");
  await page.route(`**/api/customers/${DEMO_IDS.deniedCustomer}/profile*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { data: { acceptedFacts: Array<Record<string, unknown>> } };
    const product = body.data.acceptedFacts.find((fact) => fact.kind === "product_use");
    if (product) product.qualityInput = { rubricVersion: "evidence-quality-v1", R: 2, D: 3, C: 1,
      reliabilityRationale: "Checked synthetic source", directnessRationale: "Direct observation",
      corroborationRationale: "One independent source", informationType: "architecture", dateBasis: "observation" };
    await route.fulfill({ response, json: body });
  });
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  const form = page.locator(".profile-form");
  await form.getByLabel("Record type").selectOption("product_use");
  await form.getByRole("button", { name: "Correct Synthetic deployment product" }).click();
  await expect(form.getByLabel("R (0–4)")).toHaveValue("2");
  await expect(form.getByLabel("D (0–4)")).toHaveValue("3");
  await expect(form.getByLabel("C (0–4)")).toHaveValue("1");
  await expect(form.getByLabel("Information type")).toHaveValue("architecture");
  await expect(form.getByLabel("Requested audience")).toHaveValue("delivery");
  await form.getByLabel("R (0–4)").fill("4");
  let submitted: Record<string, unknown> | null = null;
  await page.route(`**/api/customers/${DEMO_IDS.deniedCustomer}/commands`, async (route) => {
    submitted = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 201, contentType: "application/json",
      body: JSON.stringify({ data: { reviewState: "pending" } }) });
  });
  await form.getByRole("button", { name: "Save as Pending" }).click();
  await expect(form.getByRole("status")).toContainText("Proposal saved as Pending");
  expect(submitted).toMatchObject({ action: "propose_revision", requestedAudience: "delivery",
    qualityInput: { R: 4, D: 3, C: 1, informationType: "architecture", dateBasis: "observation" } });
  await expect(page.locator('section[aria-labelledby="profile-product_use"]'))
    .toContainText("Synthetic deployment product");
  await page.unrouteAll({ behavior: "wait" });
});

test("source detail explains an unavailable or restricted source without exposing content", async ({ page }) => {
  test.skip(process.env.TURAS_PROFILE_FIXTURE_READY !== "1", "Run db:seed-profile-demo for the local synthetic journey");
  await signIn(page, "mcteer");
  await page.route(`**/api/customers/${DEMO_IDS.deniedCustomer}/sources/*`, (route) =>
    route.fulfill({ status: 404, contentType: "application/json",
      body: JSON.stringify({ error: { code: "not_found", message: "Source unavailable" } }) }));
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  await page.getByRole("button", { name: "View source" }).click();
  const detail = page.locator(".profile-evidence-detail");
  await expect(detail.getByRole("alert")).toHaveText("This source is unavailable to your account.");
  await expect(detail).not.toContainText("A fictional platform documents deployment review checks");
  await detail.getByRole("button", { name: "Close source" }).click();
  await expect(detail).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("an internal reviewer can flag, confirm and resolve a displayed conflict", async ({ page }) => {
  await signIn(page, "mcteer");
  const firstId = randomUUID(), secondId = randomUUID(), conflictId = randomUUID();
  const facts = [
    { id: firstId, recordId: randomUUID(), workloadId: null, kind: "claim",
      recordVersion: 1, reviewState: "accepted", payload: { kind: "claim", text: "Synthetic first position" } },
    { id: secondId, recordId: randomUUID(), workloadId: null, kind: "claim",
      recordVersion: 1, reviewState: "accepted", payload: { kind: "claim", text: "Synthetic opposing position" } },
  ];
  let state: "none" | "flagged" | "confirmed" | "resolved" = "none";
  const commands: Record<string, unknown>[] = [];
  await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { data: Record<string, unknown> };
    body.data.acceptedFacts = state === "confirmed" ? [facts[0]] : facts;
    body.data.openConflicts = state === "none" || state === "resolved" ? [] : [{ id: conflictId,
      state, version: state === "flagged" ? 1 : 2,
      firstRevisionId: firstId, secondRevisionId: secondId,
      rationale: "Synthetic contradictory observations" }];
    await route.fulfill({ response, json: body });
  });
  await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/commands`, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const command = route.request().postDataJSON() as Record<string, unknown>;
    commands.push(command);
    state = command.action === "flag_conflict" ? "flagged" :
      command.action === "confirm_conflict" ? "confirmed" : "resolved";
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ data: { conflictId, state, version: commands.length } }) });
  });
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
  const section = page.locator('section[aria-labelledby="profile-conflicts"]');
  await expect(section.getByRole("heading", { name: "Evidence Conflicts" })).toBeVisible();
  await section.getByLabel("First accepted fact").selectOption(firstId);
  await section.getByLabel("Second accepted fact").selectOption(secondId);
  await section.getByLabel("Contradiction reason").fill("Synthetic contradictory observations");
  await section.getByRole("button", { name: "Flag conflict" }).click();
  await expect(section.getByRole("heading", { name: "Flagged Conflict" })).toBeVisible();
  expect(commands[0]).toMatchObject({ action: "flag_conflict", firstRevisionId: firstId,
    secondRevisionId: secondId });
  await section.getByLabel("Decision rationale").fill("Synthetic contradiction confirmed");
  await section.getByRole("button", { name: "Confirm conflict" }).click();
  await expect(section.getByRole("heading", { name: "Confirmed Conflict" })).toBeVisible();
  expect(commands[1]).toMatchObject({ action: "confirm_conflict", conflictId, expectedVersion: 1 });
  await section.getByLabel("Decision rationale").fill("Synthetic opposing fact withdrawn");
  await section.getByLabel("Current resolution evidence").selectOption(firstId);
  await section.getByRole("button", { name: "Resolve conflict" }).click();
  await expect(section.getByText("No open conflicts.")).toBeVisible();
  expect(commands[2]).toMatchObject({ action: "resolve_conflict", conflictId,
    expectedVersion: 2, resolutionRevisionIds: [firstId] });
  await page.unrouteAll({ behavior: "wait" });
});
