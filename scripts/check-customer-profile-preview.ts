import {readFile,mkdir,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {webkit,type BrowserContext} from 'playwright';

/** Hosted acceptance only: real HTTP data and real rendered Preview pages.
 * No fixture injection, route replacement, schema changes or research dispatch. */
const args=process.argv.slice(2),options:Record<string,string>={};
for(let i=0;i<args.length;i+=2){const key=args[i]?.replace(/^--/,'');if(!['origin','commit','output'].includes(key)||options[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Use --origin <Preview URL> --commit <40-character SHA> --output <private-directory>');options[key]=args[i+1];}
if(Object.keys(options).length!==3||!/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(options.origin)||! /^[a-f0-9]{40}$/.test(options.commit))throw Error('Exact Preview origin and commit required');
const root=resolve(options.output);if(!root.startsWith(resolve('local-artifacts')+'/'))throw Error('Private local artifact output required');await mkdir(root,{recursive:true,mode:0o700});const stat=await lstat(root);if(stat.isSymbolicLink()||(stat.mode&0o777)!==0o700)throw Error('Private artifact directory required');
const authFile=process.env.TURAS_VERCEL_AUTH_FILE??join(homedir(),process.platform==='darwin'?'Library/Application Support/com.vercel.cli/auth.json':'.local/share/com.vercel.cli/auth.json');
const token=process.env.VERCEL_TOKEN??JSON.parse(await readFile(authFile,'utf8')).token;
if(typeof token!=='string'||!token||!process.env.TURAS_DEMO_PASSWORD)throw Error('Operator credentials required');
const team='team_0749UEimtvZX3pzATqdf9gLx',projectId='prj_txyye8bipD1KDM4EYi0BY39Jpdbe';
async function metadata(path:string){const response=await fetch('https://api.vercel.com'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Deployment metadata unavailable');return response.json();}
const deployment=await metadata('/v13/deployments/'+new URL(options.origin).hostname+'?teamId='+team);
if(deployment.projectId!==projectId||deployment.readyState!=='READY'||deployment.target==='production'||deployment.meta?.githubCommitSha!==options.commit||deployment.meta?.githubCommitRef==='main')throw Error('Exact ready Preview deployment required');
const project=await metadata('/v9/projects/'+projectId+'?teamId='+team),entries=Object.entries(project.protectionBypass??{});if(entries.length!==1)throw Error('Existing Preview automation bypass is ambiguous');
const browser=await webkit.launch(),contexts:BrowserContext[]=[];
const sessions:Array<{context:BrowserContext;origin:string;csrf:string}>=[];
const username=process.env.TURAS_DEMO_USERNAME??'mcteer',password=process.env.TURAS_DEMO_PASSWORD;
async function signedIn(origin:string,preview=false){
 const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1100},colorScheme:'dark'});contexts.push(context);
 if(preview)await context.route(origin+'/**',route=>route.continue({headers:{...route.request().headers(),
  'x-vercel-protection-bypass':entries[0][0],'x-vercel-set-bypass-cookie':'true'}}));
 const loginPage=await context.newPage();await loginPage.goto('/login?returnTo=/customers');await loginPage.getByLabel('Username',{exact:true}).fill(username);await loginPage.getByLabel('Password',{exact:true}).fill(password);const loginResponse=loginPage.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login'&&response.request().method()==='POST');await loginPage.getByRole('button',{name:'Sign in',exact:true}).click();const login=await loginResponse;if(!login.ok())throw Error('Hosted browser authentication failed');const body=await login.json();if(typeof body.data?.csrfToken!=='string')throw Error('Hosted session receipt unavailable');sessions.push({context,origin,csrf:body.data.csrfToken});await loginPage.waitForURL('**/customers');await loginPage.close();return sessions.at(-1)!;
}
async function directory(context:BrowserContext){const items:Array<{id:string;displayName:string;synthetic:boolean}>=[];let cursor:string|null=null;for(let count=0;count<11;count++){
 const response=await context.request.get('/api/customers?limit=50'+(cursor?'&cursor='+encodeURIComponent(cursor):''));if(!response.ok())throw Error('Hosted directory unavailable');const data=(await response.json()).data;items.push(...data.items.filter((item:{synthetic:boolean})=>!item.synthetic));cursor=data.nextCursor;if(!cursor)return items.sort((a,b)=>a.id.localeCompare(b.id));}throw Error('Hosted directory exceeded bound');}
async function profile(context:BrowserContext,id:string){const response=await context.request.get('/api/customers/'+id+'/profile');if(!response.ok())throw Error('Hosted profile unavailable');return(await response.json()).data;}
function factsDigest(data:any){const sources=data.attributedResearch.map((row:any)=>({id:row.sourceRevisionId,title:row.title,location:row.location,claim:row.supportedClaim,publicationAt:row.publicationAt,observationAt:row.observationAt,retrievalAt:row.retrievalAt})).sort((a:any,b:any)=>a.id.localeCompare(b.id));return createHash('sha256').update(JSON.stringify({customer:data.customer,workloads:data.workloads,acceptedFacts:data.acceptedFacts.map((row:any)=>({id:row.id,kind:row.kind,payload:row.payload,workloadId:row.workloadId,audience:row.audience})),sources})).digest('hex');}
try{
 const preview=await signedIn(options.origin,true),production=await signedIn('https://www.turas.dev');
 const branchAliases=(deployment.alias??[]).filter((alias:string)=>alias.includes('-git-'));if(branchAliases.length!==1)throw Error('Exact branch Preview alias required');const branchOrigin='https://'+branchAliases[0];await signedIn(branchOrigin,true);
 const previewCustomers=await directory(preview.context),productionCustomers=await directory(production.context);
 if(!previewCustomers.length||JSON.stringify(previewCustomers)!==JSON.stringify(productionCustomers))throw Error('Real customer directory differs from Production');
 const page=await preview.context.newPage();await page.goto('/customers');await page.getByRole('heading',{name:'Customer Profiles',exact:true}).waitFor();if(await page.getByRole('link',{name:'Open Profile',exact:true}).count())throw Error('Redundant directory action remains');
 const customers=[];
 for(const name of ['1Password','Notion']){
  const target=previewCustomers.find(customer=>customer.displayName===name);if(!target)throw Error('Required real customer is missing');
  const data=await profile(preview.context,target.id),live=await profile(production.context,target.id);if(!data.attributedResearch.length||factsDigest(data)!==factsDigest(live))throw Error('Checked customer research differs from Production');
  await page.goto('/customers');await page.getByRole('searchbox',{name:'Search Customers'}).fill(name);await page.locator('.customer-card h2').getByRole('link',{name,exact:true}).click();await page.waitForURL('**/customers/'+target.id);await page.getByRole('region',{name:'Customer Overview'}).waitFor();
  const correct=await page.evaluate(()=>{const overview=document.querySelector('.customer-summary'),toolbar=document.querySelector('.profile-toolbar');return!!overview&&!!toolbar&&!!(overview.compareDocumentPosition(toolbar)&Node.DOCUMENT_POSITION_FOLLOWING)&&!document.body.innerText.includes('Customer-wide maturity');});if(!correct)throw Error('Hosted overview placement failed');
  await page.getByRole('button',{name:'Vercel Sandbox',exact:true}).waitFor();if(name==='1Password')await page.getByRole('button',{name:'AI SDK',exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:join(root,name.toLowerCase()+'-desktop-dark.png'),fullPage:true});
  await page.getByRole('button',{name:'Vercel Sandbox',exact:true}).click();await page.getByRole('heading',{name:'Source Detail',exact:true}).waitFor();await page.getByRole('button',{name:'Close source',exact:true}).click();
  const search=await preview.context.request.post('/api/retrieval/search',{headers:{Origin:options.origin,'x-csrf-token':preview.csrf},data:{scope:'customer',customerId:target.id,query:'Sandboxes',use:'accepted_fact',limit:10}});if(!search.ok())throw Error('Hosted evidence search unavailable');const found=(await search.json()).data;if(!found.results?.some((result:unknown)=>/sandbox/i.test(JSON.stringify(result))))throw Error('Sandbox evidence is missing');
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({colorScheme:'light'});await page.evaluate(()=>window.scrollTo(0,0));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:join(root,name.toLowerCase()+'-mobile-light.png'),fullPage:false});
  await page.setViewportSize({width:1440,height:1100});await page.emulateMedia({colorScheme:'dark'});
  customers.push({name,researchCount:data.attributedResearch.length,productionResearchMatches:true,overviewFirst:true,productsVisible:true,sourceDetailsReady:true,sandboxSearchResults:found.results.length,searchMode:found.mode});
 }
 const receipt={gate:'customer-profile-hosted-preview',id:randomUUID(),origin:options.origin,commit:options.commit,verifiedAt:new Date().toISOString(),actualHttpData:true,responseSubstitution:false,browserFormLogin:true,branchOrigin,branchLogin:true,realCustomerCount:previewCustomers.length,directoryMatchesProduction:true,webkit:true,customers};await writeFile(join(root,'receipt.json'),JSON.stringify(receipt),{mode:0o600});console.log(JSON.stringify(receipt));
}finally{
 let cleanupFailed=false;for(const session of sessions){try{const response=await session.context.request.post('/api/auth/logout',{headers:{Origin:session.origin,'x-csrf-token':session.csrf}});if(!response.ok())cleanupFailed=true;}catch{cleanupFailed=true;}}
 await Promise.all(contexts.map(context=>context.close()));await browser.close();if(cleanupFailed)throw Error('Hosted test session cleanup failed');
}
