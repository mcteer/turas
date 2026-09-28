import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test("a partner claim stays Pending through submission, then accepts and retracts through review", async (
  { page, browser }, testInfo,
) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Shared review mutation runs once");
  const marker = randomUUID().slice(0, 8);
  const claim = `Synthetic delivery observation ${marker}`;
  const customerPath = `/customers/${DEMO_IDS.sharedCustomer}`;
  await signIn(page, "partner");
  await page.goto(customerPath);
  const proposal = page.locator(".profile-form");
  await proposal.getByLabel("Claim", { exact: true }).fill(claim);
  await proposal.getByRole("button", { name: "Save as Pending" }).click();
  await expect(proposal.getByRole("status")).toContainText("Proposal saved as Pending");
  await expect(page.getByRole("region", { name: "Your submissions" })).toContainText(claim);
  await expect(page.getByRole("heading", { name: claim })).toHaveCount(1);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, "mcteer");
    await adminPage.goto(`${customerPath}/review`);
    const candidate = adminPage.locator(".profile-review-card").filter({ hasText: claim });
    await expect(candidate).toBeVisible();
    await candidate.getByLabel("Internal review rationale").fill("Synthetic delivery claim verified");
    await candidate.getByLabel("Partner-safe reason").fill("Delivery context approved");
    await candidate.getByRole("button", { name: "Accept exact proposal" }).click();
    await expect(candidate).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: claim })).toHaveCount(2);
    const own = page.getByRole("region", { name: "Your submissions" }).locator(".profile-card")
      .filter({ hasText: claim });
    await expect(own).toContainText("accepted");
    await own.getByLabel("Request retraction").fill(`Synthetic withdrawal ${marker}`);
    const retractionResponse = page.waitForResponse((response) => response.url().endsWith("/commands") &&
      response.request().method() === "POST");
    await own.getByRole("button", { name: "Ask steward to retract" }).click();
    expect((await retractionResponse).status()).toBe(201);
    await adminPage.reload();
    const request = adminPage.locator(".profile-review-list .profile-card")
      .filter({ hasText: `Synthetic withdrawal ${marker}` });
    await expect(request).toBeVisible();
    await request.getByLabel("Internal rationale").fill("Synthetic claim withdrawn at contributor request");
    await request.getByRole("button", { name: "Retract accepted fact" }).click();
    await expect(request).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".profile-section")
      .filter({ has: page.getByRole("heading", { name: "Other context" }) })
      .locator(".profile-card").filter({ hasText: claim })).toHaveCount(0);

    const rejectedClaim = `Synthetic rejected observation ${marker}`;
    await page.locator(".profile-form").getByLabel("Claim", { exact: true }).fill(rejectedClaim);
    await page.locator(".profile-form").getByRole("button", { name: "Save as Pending" }).click();
    await expect(page.locator(".profile-form").getByRole("status"))
      .toContainText("Proposal saved as Pending");
    await adminPage.reload();
    const rejectedCandidate = adminPage.locator(".profile-review-card")
      .filter({ hasText: rejectedClaim });
    await expect(rejectedCandidate).toBeVisible();
    await rejectedCandidate.getByLabel("Internal review rationale").fill("Synthetic evidence is insufficient");
    await rejectedCandidate.getByLabel("Partner-safe reason").fill("More delivery evidence is needed");
    await rejectedCandidate.getByRole("button", { name: "Reject" }).click();
    await expect(rejectedCandidate).toHaveCount(0);
    await page.reload();
    const ownRejection = page.getByRole("region", { name: "Your submissions" })
      .locator(".profile-card").filter({ hasText: rejectedClaim });
    await expect(ownRejection).toContainText("rejected");
    await expect(ownRejection).toContainText("More delivery evidence is needed");
    await expect(ownRejection).not.toContainText("Synthetic evidence is insufficient");
  } finally {
    await adminContext.close();
  }
});

test("approved quality inputs survive a corrected claim and require a second exact review", async (
  { page }, testInfo,
) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Shared review mutation runs once");
  test.setTimeout(60_000);
  const marker = randomUUID().slice(0, 8);
  const title = `Synthetic rating correction ${marker}`;
  const initialText = `Synthetic original rated claim ${marker}`;
  const correctedText = `Synthetic corrected rated claim ${marker}`;
  const customerPath = `/customers/${DEMO_IDS.sharedCustomer}`;
  let acceptedRevisionId: string | undefined;
  let acceptedVersion = 0;
  await signIn(page, "mcteer");
  try {
    await page.goto(customerPath);
    const form = page.locator(".profile-form");
    await form.getByLabel("Short title").fill(title);
    await form.getByLabel("Claim", { exact: true }).fill(initialText);
    await form.getByLabel("Requested audience").selectOption("delivery");
    await form.getByLabel("R (0–4)").fill("2");
    await form.getByLabel("D (0–4)").fill("2");
    await form.getByLabel("C (0–4)").fill("1");
    await form.getByLabel("Reliability rationale").fill("Synthetic reviewed reference");
    await form.getByLabel("Directness rationale").fill("Synthetic direct observation");
    await form.getByLabel("Corroboration rationale").fill("One synthetic independent source");
    const firstSave = page.waitForResponse((response) => response.url().endsWith("/commands") &&
      response.request().method() === "POST");
    await form.getByRole("button", { name: "Save as Pending" }).click();
    const first = await firstSave;
    expect(first.status()).toBe(201);
    acceptedRevisionId = (await first.json() as { data: { revisionId: string } }).data.revisionId;
    await expect(form.getByRole("status")).toContainText("Proposal saved as Pending");
    await page.goto(`${customerPath}/review`);
    let candidate = page.locator(".profile-review-card").filter({ hasText: title });
    await expect(candidate).toBeVisible();
    await candidate.getByLabel("Internal review rationale").fill("Synthetic rating confirmed");
    await candidate.getByRole("button", { name: "Accept exact proposal" }).click();
    await expect(candidate).toHaveCount(0);
    acceptedVersion = 1;
    await page.goto(customerPath);
    await expect(page.locator('section[aria-labelledby="profile-claim"]')).toContainText(initialText);
    const correctionForm = page.locator(".profile-form");
    await correctionForm.getByRole("button", { name: `Correct ${title}` }).click();
    await expect(correctionForm.getByLabel("R (0–4)")).toHaveValue("2");
    await expect(correctionForm.getByLabel("D (0–4)")).toHaveValue("2");
    await expect(correctionForm.getByLabel("C (0–4)")).toHaveValue("1");
    await expect(correctionForm.getByLabel("Requested audience")).toHaveValue("delivery");
    await correctionForm.getByRole("textbox", { name: "Claim", exact: true })
      .fill(correctedText, { timeout: 5_000 });
    await correctionForm.getByLabel("R (0–4)").fill("3");
    const secondSave = page.waitForResponse((response) => response.url().endsWith("/commands") &&
      response.request().method() === "POST");
    await correctionForm.getByRole("button", { name: "Save as Pending" }).click();
    const second = await secondSave;
    expect(second.status()).toBe(201);
    const correctionRevisionId = (await second.json() as { data: { revisionId: string } }).data.revisionId;
    await expect(page.locator('section[aria-labelledby="profile-claim"]')).toContainText(initialText);
    await expect(page.locator('section[aria-labelledby="profile-claim"]')).not.toContainText(correctedText);
    await page.goto(`${customerPath}/review`);
    candidate = page.locator(".profile-review-card").filter({ hasText: correctedText });
    await expect(candidate).toBeVisible();
    await candidate.getByLabel("Internal review rationale").fill("Synthetic corrected rating confirmed");
    await candidate.getByRole("button", { name: "Accept exact proposal" }).click();
    await expect(candidate).toHaveCount(0);
    acceptedRevisionId = correctionRevisionId;
    acceptedVersion = 2;
    await page.goto(customerPath);
    const facts = page.locator('section[aria-labelledby="profile-claim"]');
    await expect(facts).toContainText(correctedText);
    await expect(facts).not.toContainText(initialText);
  } finally {
    if (acceptedRevisionId && acceptedVersion > 0) {
      const session = await page.request.get("/api/auth/session");
      const csrf = (await session.json() as { data: { csrfToken: string } }).data.csrfToken;
      const cleanup = await page.request.post(`/api/customers/${DEMO_IDS.sharedCustomer}/commands`, {
        headers: { origin: "http://127.0.0.1:3000", "x-csrf-token": csrf },
        data: { action: "retract_revision", requestKey: randomUUID(),
          revisionId: acceptedRevisionId, expectedRecordVersion: acceptedVersion,
          rationale: "Synthetic rating correction cleanup" },
      });
      expect(cleanup.status()).toBe(200);
    }
  }
});

test("a stale second review keeps its rationale and reports the conflict", async (
  { page, browser }, testInfo,
) => {
  test.skip(testInfo.project.name !== "webkit-desktop-light", "Shared review mutation runs once");
  const title = `Synthetic competing review ${randomUUID().slice(0, 8)}`;
  const customerPath = `/customers/${DEMO_IDS.sharedCustomer}`;
  let revisionId: string | undefined;
  let accepted = false;
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await signIn(page, "mcteer");
    await page.goto(customerPath);
    const form = page.locator(".profile-form");
    await form.getByLabel("Short title").fill(title);
    await form.getByRole("textbox", { name: "Claim", exact: true }).fill(title);
    const save = page.waitForResponse((response) => response.url().endsWith("/commands") &&
      response.request().method() === "POST");
    await form.getByRole("button", { name: "Save as Pending" }).click();
    const saved = await save;
    expect(saved.status()).toBe(201);
    revisionId = (await saved.json() as { data: { revisionId: string } }).data.revisionId;
    await signIn(secondPage, "mcteer");
    await page.goto(`${customerPath}/review`);
    await secondPage.goto(`${customerPath}/review`);
    const firstCandidate = page.locator(".profile-review-card").filter({ hasText: title });
    const secondCandidate = secondPage.locator(".profile-review-card").filter({ hasText: title });
    await expect(firstCandidate).toBeVisible();
    await expect(secondCandidate).toBeVisible();
    await secondCandidate.getByLabel("Internal review rationale").fill("Keep this stale rationale visible");
    await firstCandidate.getByLabel("Internal review rationale").fill("Synthetic first decision wins");
    await firstCandidate.getByRole("button", { name: "Accept exact proposal" }).click();
    await expect(firstCandidate).toHaveCount(0);
    accepted = true;
    const staleResponse = secondPage.waitForResponse((response) => response.url().endsWith("/commands") &&
      response.request().method() === "POST");
    const secondDecisionButton = secondCandidate.getByRole("button", { name: "Accept exact proposal" });
    await secondDecisionButton.click();
    expect((await staleResponse).status()).toBe(409);
    await expect(secondCandidate.getByRole("status"))
      .toContainText("Profile changed. Your review text is preserved");
    await expect(secondCandidate.getByLabel("Internal review rationale"))
      .toHaveValue("Keep this stale rationale visible");
    await expect(secondDecisionButton).toBeFocused();
  } finally {
    if (accepted && revisionId) {
      const session = await page.request.get("/api/auth/session");
      const csrf = (await session.json() as { data: { csrfToken: string } }).data.csrfToken;
      const cleanup = await page.request.post(`/api/customers/${DEMO_IDS.sharedCustomer}/commands`, {
        headers: { origin: "http://127.0.0.1:3000", "x-csrf-token": csrf },
        data: { action: "retract_revision", requestKey: randomUUID(), revisionId,
          expectedRecordVersion: 1, rationale: "Synthetic competing review cleanup" },
      });
      expect(cleanup.status()).toBe(200);
    }
    await secondContext.close();
  }
});
