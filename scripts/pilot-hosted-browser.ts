import {webkit,devices,expect} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {z} from 'zod';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';

const projects=[
 {name:'webkit-desktop-light',viewport:{width:1440,height:900},colorScheme:'light'},
 {name:'webkit-desktop-dark',viewport:{width:1440,height:900},colorScheme:'dark'},
 {name:'webkit-mobile-light',viewport:{width:390,height:844},colorScheme:'light'},
 {name:'webkit-mobile-dark',viewport:{width:390,height:844},colorScheme:'dark'},
] as const;
/** Headless CLI WebKit uses the already verified role session. No fixture SQL,
 * response substitution, credentials in artifacts, message sends or retries. */
export async function runHostedConversationBrowser(input:{scope:PilotHostedScope;headers:Headers;conversationId:string;foreignConversationIds?:readonly string[];signal:AbortSignal}){
 const {scope,headers,signal}=input,conversationId=z.uuid().parse(input.conversationId),foreign=z.array(z.uuid()).max(20).parse(input.foreignConversationIds??[]);
 const origin=new URL(scope.origin).origin;
 const cookie=/(?:^|;\s*)((?:__Host-)?turas_session)=([A-Za-z0-9_-]{43})(?:;|$)/.exec(headers.get('cookie')??'');
 if(!cookie)throw Error('Exact hosted browser session required');
 signal.throwIfAborted();
 const browser=await webkit.launch({headless:true});
 const cancel=()=>{void browser.close().catch(()=>undefined);};signal.addEventListener('abort',cancel,{once:true});
 const cases:{id:string;project:typeof projects[number]['name'];state:'pass'}[]=[];
 try{
  for(const project of projects){
   signal.throwIfAborted();
   const bypass=headers.get('x-vercel-protection-bypass');
   const context=await browser.newContext({...devices['Desktop Safari'],viewport:project.viewport,colorScheme:project.colorScheme,reducedMotion:'reduce',serviceWorkers:'block',extraHTTPHeaders:bypass?{'x-vercel-protection-bypass':bypass}:{}});
   try{
    await context.addCookies([{name:cookie[1],value:cookie[2],url:origin,httpOnly:true,secure:new URL(origin).protocol==='https:',sameSite:'Lax'}]);
    const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);
    let forbidden=false,releaseMismatch=false;
    await page.route('**/*',async route=>{
     const request=route.request(),url=new URL(request.url());
     if(url.origin!==origin||!['GET','HEAD'].includes(request.method())){forbidden=true;await route.abort();return;}
     await route.continue();
    });
    page.on('response',response=>{
     if(new URL(response.url()).pathname.startsWith('/api/')&&response.headers()['x-turas-code-version']!==scope.sourceCommit)releaseMismatch=true;
    });
    async function ownedRead(){
     const response=await context.request.get(origin+'/api/conversations/'+conversationId,{timeout:15000,failOnStatusCode:false});
     try{
      if(response.status()!==200||response.headers()['x-turas-code-version']!==scope.sourceCommit)throw Error('Hosted browser owner read differs');
      const body=await response.body();if(body.byteLength>1048576)throw Error('Hosted browser private response bound exceeded');
      const detail=z.object({data:z.object({id:z.literal(conversationId),bindingState:z.literal('unbound'),eveSessionId:z.null(),history:z.array(z.unknown()).length(0),attempts:z.array(z.unknown()).length(0)})}).parse(JSON.parse(body.toString()));void detail;
     }finally{await response.dispose();}
     await page.goto(origin+'/s/'+conversationId,{waitUntil:'domcontentloaded'});
     await expect(page.getByRole('status').filter({hasText:'Chat binding is unbound. Reload to check again.'})).toBeVisible();
     await expect(page.getByLabel('Message Turi',{exact:true})).toHaveCount(0);
     await expect(page.getByLabel('Synthetic workspace context',{exact:true})).toHaveText('Synthetic Pilot · Test Data');
    }
    await ownedRead();await ownedRead();cases.push({id:'owned-parked-reload',project:project.name,state:'pass'});
    if(project.viewport.width<600){
     const trigger=page.getByRole('button',{name:'Open navigation',exact:true});await trigger.click();
     const navigation=page.getByRole('dialog',{name:'Navigation',exact:true});await expect(navigation).toBeVisible();await page.keyboard.press('Tab');
     if(!await navigation.evaluate(node=>node.contains(document.activeElement)))throw Error('Hosted browser navigation focus escaped');
     await page.keyboard.press('Escape');await expect(navigation).toBeHidden();await expect(trigger).toBeFocused();
    }else{
     await page.getByRole('link',{name:'New Chat',exact:true}).focus();await page.keyboard.press('Tab');
     if(!await page.evaluate(()=>document.activeElement instanceof HTMLElement&&document.activeElement!==document.body))throw Error('Hosted browser keyboard focus unavailable');
    }
    cases.push({id:'keyboard-focus',project:project.name,state:'pass'});
    if(!await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw Error('Hosted browser horizontal overflow');
    cases.push({id:'responsive-overflow',project:project.name,state:'pass'});
    if((await new AxeBuilder({page}).analyze()).violations.some(row=>['serious','critical'].includes(row.impact??'')))throw Error('Hosted browser accessibility gate failed');
    cases.push({id:'serious-critical-accessibility',project:project.name,state:'pass'});
    for(const id of foreign){
     const response=await context.request.get(origin+'/api/conversations/'+id,{timeout:15000,failOnStatusCode:false});
     try{if(response.status()!==404||response.headers()['x-turas-code-version']!==scope.sourceCommit)throw Error('Hosted browser foreign-owner response was not withheld');}finally{await response.dispose();}
     const navigation=await page.goto(origin+'/s/'+id,{waitUntil:'domcontentloaded'});
     if(navigation?.status()!==404)throw Error('Hosted browser foreign-owner page was not withheld');
     await expect(page.getByRole('heading',{name:'404',exact:true})).toBeVisible();await expect(page.getByLabel('Message Turi',{exact:true})).toHaveCount(0);
     cases.push({id:'foreign-owner-unavailable',project:project.name,state:'pass'});
    }
    signal.throwIfAborted();if(forbidden||releaseMismatch)throw Error('Hosted browser transport or release boundary failed');
   }finally{await context.close();}
  }
 }finally{signal.removeEventListener('abort',cancel);await browser.close();}
 return {contract:'pilot-hosted-conversation-browser-v1',journey:'J002',cases,passedCases:cases.length,projects:projects.map(row=>row.name),providerCalls:0,parkedOnly:true,streamResumeStopVerified:false,fullHostedCatalogVerified:false};
}
