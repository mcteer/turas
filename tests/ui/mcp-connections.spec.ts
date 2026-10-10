import { test,expect } from '@playwright/test';
import { mcpFixture,mcpInternalPeer,withMcpDatabase } from '../fixtures/mcp/setup';
import { createMcpConnection } from '../../lib/server/mcp/management';
import { randomUUID } from 'node:crypto';
test.beforeEach(()=>{if(process.env.TURAS_MCP_UI_FIXTURE_READY!=='1')throw Error('Owned MCP UI runner required');});
test('creates explicit access, keeps the credential out of DOM/storage and revokes it',async({page})=>{
  const fixture=await withMcpDatabase(db=>mcpFixture(db));
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(value:string)=>{(window as unknown as {mcpCopied:boolean}).mcpCopied=/^tmcp\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(value);}}});});
  await page.goto('/settings/connections');await expect(page.getByRole('heading',{name:'Create Connection',exact:true})).toBeVisible();
  await expect(page.getByLabel('Shared Knowledge',{exact:true})).not.toBeChecked();
  await page.getByLabel('Connection Name',{exact:true}).fill('Synthetic UI Assistant');await page.getByLabel('Shared Knowledge',{exact:true}).check();
  await page.getByLabel('I reviewed this scope and expiration.',{exact:true}).check();await page.getByRole('button',{name:'Create Connection',exact:true}).click();
  const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:'One-Time Credential'})).toBeVisible();
  expect(await page.locator('body').innerHTML()).not.toMatch(/tmcp\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}/);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toMatch(/tmcp\.[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}/);
  await dialog.getByRole('button',{name:'Copy Credential',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as {mcpCopied:boolean}).mcpCopied)).toBe(true);
  await dialog.getByRole('button',{name:'Dismiss and Discard Credential',exact:true}).click();await expect(dialog).not.toBeVisible();
  await page.getByRole('button',{name:'Revoke Synthetic UI Assistant',exact:true}).click();await dialog.getByRole('button',{name:'Confirm Revocation',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Connection revoked.'})).toBeVisible();
  await page.reload();await expect(page.getByRole('button',{name:'Revoke Synthetic UI Assistant',exact:true})).toBeDisabled();
});
test('partner can manage only its own access and scope refresh hides revoked customer names',async({page})=>{
  const fixture=await withMcpDatabase(db=>mcpFixture(db,'partner'));
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/settings/connections');await expect(page.getByLabel('Synthetic MCP customer',{exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Workspace Access',exact:true})).toHaveCount(0);
  await withMcpDatabase(db=>db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1",[fixture.browser.membershipId]));
  await page.getByRole('button',{name:'Refresh Connections',exact:true}).click();await expect(page.getByLabel('Synthetic MCP customer',{exact:true})).toHaveCount(0);
});
test('lost creation response reconciles safely without retry or secret recovery',async({page})=>{
  const fixture=await withMcpDatabase(db=>mcpFixture(db));
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  let attempts=0;
  await page.route('**/api/mcp/connections',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}attempts++;
    const input=route.request().postDataJSON();await createMcpConnection(fixture.browser,input);await route.abort('failed');
  });
  await page.goto('/settings/connections');await page.getByLabel('Connection Name',{exact:true}).fill('Synthetic Lost Response');
  await page.getByLabel('Shared Knowledge',{exact:true}).check();await page.getByLabel('I reviewed this scope and expiration.',{exact:true}).check();
  await page.getByRole('button',{name:'Create Connection',exact:true}).click();await expect(page.getByRole('heading',{name:'Unconfirmed Request',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Check Request Status',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'Creation confirmed.'})).toBeVisible();
  expect(attempts).toBe(1);await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button',{name:'Revoke Synthetic Lost Response',exact:true})).toBeVisible();
});

test('canonical administrator revokes a peer connection while ordinary members see no workspace controls',async({page})=>{
  const {createProfileTestSession}=await import('../fixtures/profiles');
  const {issueSession}=await import('../../lib/server/auth/sessions');
  const name='Synthetic Peer '+randomUUID();
  const fixture=await withMcpDatabase(async db=>{
    const admin=await createProfileTestSession(db,'mcteer'),peer=await mcpInternalPeer(db,admin.workspaceId);
    const connection=await createMcpConnection(peer,{requestKey:randomUUID(),name,categories:['knowledge'],customerIds:[],lifetimeDays:7});
    return {admin,peer,connection};
  });
  await page.context().addCookies([{name:'turas_session',value:fixture.peer.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/settings/connections');await expect(page.getByRole('heading',{name:'Workspace Access',exact:true})).toHaveCount(0);
  const session=await issueSession(fixture.admin);
  await page.context().addCookies([{name:'turas_session',value:session.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.reload();await page.getByRole('button',{name:'Review Workspace Connections',exact:true}).click();
  await page.getByRole('button',{name:'Revoke '+name,exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm Revocation',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Connection revoked.'})).toBeVisible();
  await withMcpDatabase(async db=>{expect((await db.query('SELECT revoked_at FROM mcp_connections WHERE id=$1',[fixture.connection.connection.id])).rows[0].revoked_at).not.toBeNull();});
});
test('safe empty usage is visible for an inactive credential',async({page})=>{
  const fixture=await withMcpDatabase(async db=>{const value=await mcpFixture(db);await db.query("UPDATE mcp_connections SET credential_hash=NULL WHERE id=$1",[value.actor.connectionId]);return value;});
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/settings/connections');
  await page.getByRole('button',{name:'View Usage for Synthetic MCP connection',exact:true}).click();
  await expect(page.getByText('No recent usage receipts.',{exact:true})).toBeVisible();
});

test('expired credentials remain revocable and disabled UI hides creation',async({page})=>{
  const fixture=await withMcpDatabase(async db=>{const value=await mcpFixture(db);
    await db.query(`INSERT INTO mcp_connections(id,environment_id,workspace_id,principal_id,membership_id,name,categories,scope_digest,credential_hash,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,'Synthetic Expired Access',ARRAY['knowledge'],$6,$7,clock_timestamp()-interval '2 days',clock_timestamp()-interval '1 day')`,
      [randomUUID(),value.actor.environmentId,value.actor.workspaceId,value.actor.principalId,value.actor.membershipId,'c'.repeat(64),'d'.repeat(64)]);return value;});
  await page.context().addCookies([{name:'turas_session',value:fixture.browser.token,url:process.env.TURAS_UI_BASE_URL!,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/settings/connections');const expired=page.getByRole('article').filter({has:page.getByRole('heading',{name:'Synthetic Expired Access',exact:true})});
  await expect(expired.getByText(/^Expired/)).toBeVisible();await expired.getByRole('button',{name:'Revoke Synthetic Expired Access',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Confirm Revocation',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Connection revoked.'})).toBeVisible();
  await page.route('**/api/mcp/connections?*',async route=>{const response=await route.fetch(),body=await response.json();body.data.serviceState='disabled';await route.fulfill({response,json:body});});
  await page.getByRole('button',{name:'Refresh Connections',exact:true}).click();await expect(page.getByRole('heading',{name:'Create Connection',exact:true})).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'New connections and external reads are disabled.'})).toBeVisible();
});
