import { test,expect,type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "pg";
import { requireOwnedPilotDatabase } from "../../scripts/pilot-environment";
import { ensurePilotWorkspaceFixture } from "../fixtures/pilot/workspace";

test.beforeEach(async()=>{
 if(process.env.TURAS_PILOT_UI_FIXTURE_READY!=="1")throw new Error("Owned pilot UI runner required");
 const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();try{await ensurePilotWorkspaceFixture(owner);}finally{await owner.end();}
});
async function login(page:Page,username="mcteer"){
 await page.goto("/login?returnTo=%2Fcustomers");await page.getByLabel("Username",{exact:true}).fill(username);await page.getByLabel("Password",{exact:true}).fill(username==="partner"?process.env.PARTNER_PASSWORD!:process.env.TURAS_DEMO_PASSWORD!);await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();
}
async function navigation(page:Page){const trigger=page.getByRole("button",{name:"Open navigation",exact:true});if(await trigger.isVisible())await trigger.click();}
test("signs into primary without a synthetic workspace selector",async({page})=>{await page.goto('/login?workspace=pilot');await expect(page.getByLabel('Workspace',{exact:true})).toHaveCount(0);await expect(page.getByText('Synthetic Pilot',{exact:true})).toHaveCount(0);await login(page);await expect(page.getByLabel('Synthetic workspace context',{exact:true})).toHaveCount(0);});
test("rejects a retired pilot login without creating a session",async({page})=>{await page.goto('/login');const response=await page.request.post('/api/auth/login',{headers:{origin:process.env.TURAS_APP_ORIGIN!},data:{username:'mcteer',password:process.env.TURAS_DEMO_PASSWORD!,workspace:'pilot'}});expect(response.status()).toBe(422);expect(response.headers()['set-cookie']).toBeUndefined();expect((await page.request.get('/api/auth/session')).status()).toBe(401);});
test("supports keyboard focus and navigation",async({page})=>{await page.goto("/login");await page.getByLabel("Username",{exact:true}).focus();await page.keyboard.press("Tab");await expect(page.getByLabel("Password",{exact:true})).toBeFocused();await page.keyboard.press("Shift+Tab");await expect(page.getByLabel("Username",{exact:true})).toBeFocused();await login(page);const trigger=page.getByRole("button",{name:"Open navigation",exact:true});if(await trigger.isVisible()){await trigger.click();await expect(page.getByRole("dialog",{name:"Navigation",exact:true})).toBeVisible();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();}else{await page.getByRole("link",{name:"Customer Profiles",exact:true}).focus();await expect(page.getByRole("link",{name:"Customer Profiles",exact:true})).toBeFocused();}});
test("shows denied empty and error states",async({page})=>{
 await test.step('authenticates the assigned primary workspace',async()=>{await login(page);await expect(page).not.toHaveURL(/\/login/);});
 await test.step('shows the customer request failure',async()=>{
  await page.route("**/api/customers*",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{message:"Customers are unavailable"}})}));await page.reload();await expect(page.getByRole("alert").filter({hasText:"Customers are unavailable"})).toContainText("Customers are unavailable.");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
test("preserves primary workspace behavior",async({page},info)=>{await login(page);await expect(page).not.toHaveURL(/\/login/);await page.goto("/customers");await expect(page.getByRole("heading",{name:"Customer Profiles",exact:true})).toBeVisible();await expect(page.getByLabel("Workspace Context",{exact:true})).toHaveCount(0);await expect(page.getByLabel("Synthetic workspace context",{exact:true})).toHaveCount(0);expect((await new AxeBuilder({page}).analyze()).violations.filter(v=>["serious","critical"].includes(v.impact??"")).map(v=>v.id)).toEqual([]);await page.screenshot({path:info.outputPath("primary-workspace.png"),fullPage:true});});
