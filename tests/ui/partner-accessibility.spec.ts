import {test,expect} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {partnerGuideFixture} from "../fixtures/partners/guides";
import {withPartnerDatabase} from "../fixtures/partners/environment";
test.beforeEach(async()=>{if(process.env.TURAS_PARTNERS_UI_FIXTURE_READY!=="1")throw Error("Owned partner UI runner required");await withPartnerDatabase(db=>db.query("DELETE FROM partner_rate_windows WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]));});
test("supports keyboard navigation and accessible bounded guide layouts",async({page},info)=>{
 test.setTimeout(90000);
 const f=await partnerGuideFixture(`Synthetic accessible guide ${info.project.name}`,true);
 const mobile=info.project.name.includes("mobile"),navigation=page.locator(mobile?".mobile-panel":".desktop-sidebar"),link=navigation.getByRole("link",{name:"Partner Delivery",exact:true});
 await page.context().addCookies([{name:"turas_session",value:f.partner.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:"Lax"}]);
 for(const path of [`/partners/guides/${f.guideId}`,"/partners"]){
  if(path==="/partners"){if(mobile)await page.getByRole("button",{name:"Open navigation",exact:true}).click();await link.click();}else await page.goto(path);await expect(page).toHaveURL(new RegExp(path+"$"));await expect(page.getByTestId("partner-protected-body")).toBeVisible();
  if(mobile)await page.getByRole("button",{name:"Open navigation",exact:true}).click();await link.focus();await expect(link).toBeFocused();await page.keyboard.press("Tab");
  expect(await page.evaluate(()=>document.activeElement!==document.body)).toBe(true);
  if(mobile)await page.keyboard.press("Escape");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const violations=(await new AxeBuilder({page}).analyze()).violations.filter(v=>["serious","critical"].includes(v.impact??""));expect(violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
  await page.screenshot({path:info.outputPath(path==="/partners"?"synthetic-accessible-workspace.png":"synthetic-accessible-guide.png"),fullPage:true});
 }
});
