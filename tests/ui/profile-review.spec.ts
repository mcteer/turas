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
