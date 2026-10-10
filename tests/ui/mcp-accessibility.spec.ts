import { test,expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mcpFixture,withMcpDatabase } from '../fixtures/mcp/setup';
test.beforeEach(()=>{if(process.env.TURAS_MCP_UI_FIXTURE_READY!=='1')throw Error('Owned MCP UI runner required');});
test('supports keyboard cancellation, visible focus and bounded accessible layout',async({page},info)=>{
  const fixture=await withMcpDatabase(db=>mcpFixture(db));await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/settings/connections');const revoke=page.getByRole('button',{name:'Revoke Synthetic MCP connection',exact:true});
  await expect(revoke).toBeVisible();await revoke.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(revoke).toBeFocused();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).analyze()).violations.filter(item=>['serious','critical'].includes(item.impact??'')).map(item=>item.id)).toEqual([]);
  await page.screenshot({path:info.outputPath('connections.png'),fullPage:true});
});

test('empty and unavailable responses have accessible recovery states',async({page})=>{
  const fixture=await withMcpDatabase(db=>mcpFixture(db));
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.route('**/api/mcp/connections?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{message:'Unavailable'}})}));
  await page.goto('/settings/connections');await expect(page.getByRole('status').filter({hasText:'Connections are unavailable.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Refresh Connections',exact:true})).toBeEnabled();
  await page.unroute('**/api/mcp/connections?*');
  await page.getByRole('button',{name:'Refresh Connections',exact:true}).click();
  await expect(page.getByRole('heading',{name:'My Connections',exact:true})).toBeVisible();
});
