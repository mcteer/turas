import {it,expect} from 'vitest';
import {webkit,expect as browserExpect} from '@playwright/test';
import {Client,type PoolClient} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {provisionPilotWorkspace} from '../../../scripts/provision-pilot-workspace';
import {runHostedConversationBoundary} from '../../../scripts/pilot-hosted-conversations';
import {runHostedConversationBrowser} from '../../../scripts/pilot-hosted-browser';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {closeRuntimePool} from '../../../lib/server/db/client';

it('uses actual served role sessions and four CLI WebKit configurations for parked ownership and lifecycle boundaries',async()=>{
 await withPilotEnvironment(async environment=>{
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),runtime=new Client({connectionString:requireOwnedPilotDatabase()});
  await owner.connect();await runtime.connect();
  try{
   const workspaceId=randomUUID(),customerIds=[randomUUID(),randomUUID()];
   const memberships=[{principalId:DEMO_IDS.mcteer,membershipId:randomUUID(),kind:'internal',role:'admin'},{principalId:DEMO_IDS.panel,membershipId:randomUUID(),kind:'internal',role:'member'},{principalId:DEMO_IDS.partner,membershipId:randomUUID(),kind:'partner',role:'member',partnerOrganizationId:randomUUID()}];
   await provisionPilotWorkspace(owner as unknown as PoolClient,{version:'pilot-provision-v1',environmentId:environment.environmentId,workspaceId,provisioningId:randomUUID(),memberships,customers:customerIds.map((id,index)=>({id,label:'Parked Browser '+index})),grants:[{id:randomUUID(),membershipId:memberships[2].membershipId,customerId:customerIds[0]}]});
   // Local transport validates runner plumbing; no platform deployment or
   // hosted acceptance is claimed by this owned production-served fixture.
   const scope:PilotHostedScope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:environment.origin,environmentMarker:environment.environmentId,workspaceId,target:'production',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)};
   await closeRuntimePool();await environment.startProduction();
   const conversations:string[]=[],proofs:Awaited<ReturnType<typeof runHostedConversationBrowser>>[]=[];
   for(const [username,password] of [['mcteer',process.env.TURAS_DEMO_PASSWORD],['panel',process.env.PANEL_PASSWORD],['partner',process.env.PARTNER_PASSWORD]]){
    const headers=new Headers({origin:environment.origin,'content-type':'application/json'});
    const login=await fetch(environment.origin+'/api/auth/login',{method:'POST',headers,body:JSON.stringify({username,password,workspace:'pilot'}),redirect:'manual',signal:environment.signal});
    expect(login.status).toBe(200);expect(login.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);
    const cookie=login.headers.getSetCookie().find(value=>value.startsWith('turas_session='))?.split(';')[0];expect(cookie).toBeTruthy();headers.set('cookie',cookie!);
    const body=await login.json();headers.set('x-csrf-token',body.data.csrfToken);
    try{
     const conversation=await runHostedConversationBoundary({scope,db:runtime,headers,customerId:customerIds[0],signal:environment.signal,foreignConversationIds:conversations});
     if(username==='mcteer'){
      // Hold actual script delivery so the server HTML is observable before
      // React attaches handlers. No document or API response is substituted.
      const browser=await webkit.launch({headless:true});
      let releaseScripts!:()=>void;const scripts=new Promise<void>(resolve=>{releaseScripts=resolve;});
      try{
       const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
       const token=cookie!.slice(cookie!.indexOf('=')+1);
       await context.addCookies([{name:'turas_session',value:token,url:environment.origin,httpOnly:true,sameSite:'Lax'}]);
       const page=await context.newPage();
       await page.route('**/*',async route=>{if(route.request().resourceType()==='script')await scripts;await route.continue();});
       await page.goto(environment.origin+'/s/'+conversation.conversationId,{waitUntil:'commit'});
       const trigger=page.getByRole('button',{name:'Open navigation',exact:true});
       await browserExpect(trigger).toBeVisible();await browserExpect(trigger).toBeDisabled();
       releaseScripts();await browserExpect(trigger).toBeEnabled({timeout:15000});await trigger.click();
       await browserExpect(page.getByRole('dialog',{name:'Navigation',exact:true})).toBeVisible();
      }finally{releaseScripts();await browser.close();}
     }
     const browser=await runHostedConversationBrowser({scope,headers,conversationId:conversation.conversationId,foreignConversationIds:conversations,signal:environment.signal});
     proofs.push(browser);conversations.push(conversation.conversationId);
    }finally{
     const response=await fetch(environment.origin+'/api/auth/logout',{method:'POST',headers,redirect:'manual',signal:AbortSignal.timeout(5000)});await response.body?.cancel();expect(response.status).toBe(200);
    }
   }
   expect(proofs.map(row=>row.passedCases)).toEqual([16,20,24]);
   expect(proofs.every(row=>row.projects.length===4&&row.providerCalls===0&&!row.streamResumeStopVerified&&!row.fullHostedCatalogVerified)).toBe(true);
   expect((await owner.query('SELECT count(*)::int AS n FROM login_sessions WHERE workspace_id=$1 AND revoked_at IS NULL',[workspaceId])).rows[0].n).toBe(0);
   expect((await owner.query('SELECT count(*)::int AS n FROM conversations WHERE workspace_id=$1 AND (archived_at IS NULL OR eve_session_id IS NOT NULL)',[workspaceId])).rows[0].n).toBe(0);
  }finally{await runtime.end();await owner.end();await closeRuntimePool();}
 },{postgresMajor:18,deadlineMs:300000});
},300000);
