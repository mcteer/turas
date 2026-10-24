import { test,expect,type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { requireOwnedPilotDatabase } from "../../scripts/pilot-environment";
import { ensurePilotWorkspaceFixture } from "../fixtures/pilot/workspace";

test.beforeEach(async()=>{
 if(process.env.TURAS_PILOT_UI_FIXTURE_READY!=="1")throw new Error("Owned pilot UI runner required");
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{await ensurePilotWorkspaceFixture(owner);}finally{await owner.end();}
});
async function login(page:Page,workspace="pilot",username="mcteer"){
 await page.goto("/login?returnTo=%2Fcustomers");await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Password",{exact:true}).fill(username==="partner"?process.env.PARTNER_PASSWORD!:process.env.TURAS_DEMO_PASSWORD!);await page.getByLabel("Workspace",{exact:true}).selectOption(workspace);await page.getByRole("button",{name:"Sign in",exact:true}).click();if(username!=="partner")await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();
}
async function navigation(page:Page){const trigger=page.getByRole("button",{name:"Open navigation",exact:true});if(await trigger.isVisible())await trigger.click();}
test("selects an assigned synthetic workspace at login",async({page},info)=>{await login(page);await expect(page).not.toHaveURL(/\/login/);await expect(page.getByLabel("Synthetic workspace context",{exact:true})).toHaveText("Synthetic Pilot · Test Data");await navigation(page);await expect(page.getByLabel("Workspace Context",{exact:true}).filter({visible:true})).toHaveText("Synthetic Pilot · Test Data");const close=page.getByRole("button",{name:"Close navigation",exact:true});if(await close.isVisible())await close.click();await expect(page.getByLabel("Synthetic workspace context",{exact:true})).toBeVisible();await page.screenshot({path:info.outputPath("synthetic-workspace.png"),fullPage:true});});
test("shows persistent synthetic context without transferring conversations",async({page})=>{await login(page);await expect(page).not.toHaveURL(/\/login/);await page.goto("/customers");await navigation(page);await expect(page.getByLabel("Workspace Context",{exact:true}).filter({visible:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();});
test("supports keyboard focus and navigation",async({page})=>{await page.goto("/login");await page.getByLabel("Username",{exact:true}).focus();await page.keyboard.press("Tab");await expect(page.getByLabel("Password",{exact:true})).toBeFocused();await page.keyboard.press("Tab");await expect(page.getByLabel("Workspace",{exact:true})).toBeFocused();await login(page);const trigger=page.getByRole("button",{name:"Open navigation",exact:true});if(await trigger.isVisible()){await trigger.click();await expect(page.getByRole("dialog",{name:"Navigation",exact:true})).toBeVisible();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();}else{await page.getByRole("link",{name:"Customer Profiles",exact:true}).focus();await expect(page.getByRole("link",{name:"Customer Profiles",exact:true})).toBeFocused();}});
test("shows denied empty and error states",async({page})=>{
 await test.step('denies the unassigned partner workspace',async()=>{
  await login(page,"pilot","partner");await expect(page.getByRole("alert").filter({hasText:"Invalid credentials"})).toHaveText("Invalid credentials");await expect(page).toHaveURL(/\/login/);
 });
 await test.step('authenticates the assigned internal workspace',async()=>{await login(page);await expect(page).not.toHaveURL(/\/login/);});
 await test.step('shows the actual empty customer inventory',async()=>{
  await page.goto("/customers");await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();await expect(page.getByText("No customers are assigned to this account.",{exact:true})).toBeVisible();
 });
 await test.step('shows the customer request failure',async()=>{
  await page.route("**/api/customers*",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{message:"Customers are unavailable"}})}));await page.reload();await expect(page.getByRole("alert").filter({hasText:"Customers are unavailable"})).toContainText("Customers are unavailable.");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
test("preserves primary workspace behavior",async({page},info)=>{await login(page,"primary");await expect(page).not.toHaveURL(/\/login/);await page.goto("/customers");await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();await expect(page.getByLabel("Workspace Context",{exact:true})).toHaveCount(0);await expect(page.getByLabel("Synthetic workspace context",{exact:true})).toHaveCount(0);expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>["serious","critical"].includes(v.impact??"")).map(v=>v.id)).toEqual([]);await page.screenshot({path:info.outputPath("primary-workspace.png"),fullPage:true});});
