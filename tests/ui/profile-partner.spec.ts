import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { signIn } from "../fixtures/ui";

test("partner profile shows cross-contributor accepted delivery and only its own pending submission", async ({ page }) => {
  await signIn(page, "partner");
  const accepted = `Synthetic accepted delivery ${randomUUID().slice(0, 8)}`;
  const ownPending = `Synthetic own pending ${randomUUID().slice(0, 8)}`;
  const hiddenPending = `Synthetic other pending ${randomUUID().slice(0, 8)}`;
  const hiddenOperations = `Synthetic internal operations ${randomUUID().slice(0, 8)}`;
  await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/profile*`, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { data: Record<string, unknown> };
    body.data.acceptedFacts = [{ id: randomUUID(), recordId: randomUUID(), workloadId: null,
      kind: "claim", reviewState: "accepted", recordVersion: 1,
      payload: { kind: "claim", text: accepted, sourceType: "manual" } }];
    delete body.data.openConflicts;
    await route.fulfill({ response, json: body });
  });
  await page.route(`**/api/customers/${DEMO_IDS.sharedCustomer}/submissions*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      data: { items: [{ id: randomUUID(), kind: "claim", reviewState: "pending",
        recordVersion: 0, payload: { kind: "claim", text: ownPending } }], nextCursor: null },
    }) });
  });
  await page.goto(`/customers/${DEMO_IDS.sharedCustomer}`);
  const acceptedSection = page.locator('section[aria-labelledby="profile-claim"]');
  await expect(acceptedSection).toContainText(accepted);
  await expect(page.getByRole("region", { name: "Your submissions" })).toContainText(ownPending);
  await expect(page.locator("body")).not.toContainText(hiddenPending);
  await expect(page.locator("body")).not.toContainText(hiddenOperations);
  await expect(page.getByRole("heading", { name: "Evidence conflicts" })).toHaveCount(0);
  await page.goto(`/customers/${DEMO_IDS.deniedCustomer}`);
  await expect(page.getByRole("heading", { name: "Profile unavailable" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(accepted);
});
