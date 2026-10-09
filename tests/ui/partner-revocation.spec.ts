import {test,expect} from "@playwright/test";
import {partnerGuideFixture} from "../fixtures/partners/guides";
import {withPartnerDatabase} from "../fixtures/partners/environment";
test.beforeEach(async()=>{if(process.env.TURAS_PARTNERS_UI_FIXTURE_READY!=="1")throw Error("Owned partner UI runner required");await withPartnerDatabase(db=>db.query("DELETE FROM partner_rate_windows WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]));});
test("withholds withdrawn source content on visible polling while maintenance is stopped",async({page},info)=>{
 const f=await partnerGuideFixture(`Synthetic revoked guide ${info.project.name}`,true);
 await page.context().addCookies([{name:"turas_session",value:f.partner.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:"Lax"}]);await page.goto(`/partners/guides/${f.guideId}`);await expect(page.getByTestId("partner-protected-body")).toContainText(f.content.lessons[0].objective);
 await withPartnerDatabase(db=>db.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",[f.evidence!.recordId]));
 await expect(page.getByText(f.content.lessons[0].objective,{exact:true})).toHaveCount(0,{timeout:16000});
 expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(f.content.title);
 await withPartnerDatabase(db=>db.query("UPDATE profile_records SET current_accepted_revision_id=$1 WHERE id=$2",[f.evidence!.revisionId,f.evidence!.recordId]));await page.reload();await expect(page.getByText(f.content.lessons[0].objective,{exact:true})).toHaveCount(0);
});
test("clears before focus refresh and ignores an earlier successful response after denial",async({page},info)=>{
 const f=await partnerGuideFixture(`Synthetic late response guide ${info.project.name}`,true);
 await page.context().addCookies([{name:"turas_session",value:f.partner.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:"Lax"}]);await page.goto(`/partners/guides/${f.guideId}`);await expect(page.getByTestId("partner-protected-body")).toContainText(f.content.lessons[0].objective);
 let calls=0,snapshotReady=false;let release!:()=>void,finished!:()=>void;const delayed=new Promise<void>(resolve=>{release=resolve;}),completed=new Promise<void>(resolve=>{finished=resolve;});
 await page.route(`**/api/partners/guides/${f.guideId}`,async route=>{calls++;if(calls===1){try{const response=await route.fetch();snapshotReady=true;await delayed;await route.fulfill({response}).catch(()=>undefined);}finally{finished();}}else await route.fulfill({status:403,contentType:"application/json",body:JSON.stringify({error:{code:"forbidden"}})});});
 await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByTestId("partner-protected-body")).toHaveCount(0);await expect.poll(()=>calls).toBe(1);
 await expect.poll(()=>snapshotReady).toBe(true);await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect.poll(()=>calls).toBe(2);release();await completed;await expect(page.getByTestId("partner-protected-body")).toHaveCount(0);await expect(page.getByText(f.content.lessons[0].objective,{exact:true})).toHaveCount(0);await page.unrouteAll({behavior:"wait"});
});
