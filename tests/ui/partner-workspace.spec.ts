import { test,expect,type Page } from "@playwright/test";
import { withPartnerDatabase } from "../fixtures/partners/environment";
import { partnerTestActors,partnerAdditionalMember,partnerDeliveryBaseline } from "../fixtures/partners/seed";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import type { CurrentSession } from "../../lib/server/auth/sessions";

async function session(page:Page,actor:CurrentSession){await page.context().addCookies([{name:"turas_session",value:actor.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:"Lax"}]);}
test.beforeEach(async()=>{if(process.env.TURAS_PARTNERS_UI_FIXTURE_READY!=="1")throw Error("Owned partner UI runner required");await withPartnerDatabase(db=>db.query("DELETE FROM partner_rate_windows WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]));});
test("finds assigned delivery work and follows the existing authorized domain links",async({page})=>{
 const fixture=await withPartnerDatabase(async db=>{const actors=await partnerTestActors(db);await db.query("BEGIN");try{const baseline=await partnerDeliveryBaseline(db,actors.author,actors.reviewer,DEMO_IDS.sharedCustomer,`Synthetic reviewed delivery plan ${test.info().project.name}`);await db.query("COMMIT");return {...actors,baseline};}catch(error){await db.query("ROLLBACK");throw error;}});
 await session(page,fixture.partner);await page.goto("/partners");await expect(page.getByTestId("partner-protected-body")).toBeVisible();await expect(page.getByRole("link",{name:"Cedar (synthetic)",exact:true})).toBeVisible();await expect(page.getByText("Birch (synthetic)",{exact:true})).toHaveCount(0);
 await page.getByRole("link",{name:"Cedar (synthetic)",exact:true}).click();await expect(page.getByRole("heading",{name:`Synthetic reviewed delivery plan ${test.info().project.name}`,exact:true})).toBeVisible();
 const article=page.getByRole("article").filter({has:page.getByRole("heading",{name:`Synthetic reviewed delivery plan ${test.info().project.name}`,exact:true})});
 await expect(article.getByRole("link",{name:"Delivery Plan and Proposals"})).toHaveAttribute("href",`/customers/${DEMO_IDS.sharedCustomer}/plans/${fixture.baseline.created.planId}`);
 await expect(article.getByRole("link",{name:"Delivery Execution"})).toHaveAttribute("href",`/customers/${DEMO_IDS.sharedCustomer}/engagements/${fixture.baseline.engagementId}/execution`);
 await expect(article.getByRole("link",{name:"Accepted Support"})).toHaveAttribute("href",`/customers/${DEMO_IDS.sharedCustomer}/support`);
 await article.getByRole("link",{name:"Delivery Plan and Proposals"}).click();await expect(page).toHaveURL(new RegExp(`/plans/${fixture.baseline.created.planId}$`));await expect(page.getByRole("heading",{name:`Synthetic reviewed delivery plan ${test.info().project.name}`,exact:true})).toBeVisible();
});
test("keeps shared knowledge available to an individual with no customer grants",async({page})=>{
 const actor=await withPartnerDatabase(db=>partnerAdditionalMember(db,null));await session(page,actor);await page.goto("/partners");await expect(page.getByText("No assigned customers match this search. Shared Knowledge remains available.")).toBeVisible();await expect(page.getByTestId("partner-protected-body")).not.toContainText("Cedar (synthetic)");
 await page.getByRole("link",{name:"Shared Knowledge",exact:true}).last().click();await expect(page).toHaveURL(/\/knowledge$/);await expect(page.getByRole("heading",{name:"Shared Knowledge",exact:true})).toBeVisible();
});
test("clears protected customer names on denied revalidation and stores no search prose",async({page})=>{
 const {partner}=await withPartnerDatabase(partnerTestActors);await session(page,partner);await page.goto("/partners");await expect(page.getByTestId("partner-protected-body")).toContainText("Cedar (synthetic)");
 await page.getByLabel("Search Assigned Customers").fill("Cedar");await expect(page.getByTestId("partner-protected-body")).toContainText("Cedar (synthetic)");
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain("Cedar");expect(page.url()).not.toContain("Cedar");
 await page.route("**/api/partners/workspace**",route=>route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:{code:"forbidden"}})}));await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
 await expect(page.getByTestId("partner-protected-body")).toHaveCount(0);await expect(page.getByRole("status").filter({hasText:"Delivery work is unavailable"})).toBeVisible();
});
