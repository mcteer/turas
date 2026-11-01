import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client} from 'pg';
import {webkit} from 'playwright';
import {withPlanEvalEnvironment} from './plan-eval-environment';
import {query,closeRuntimePool} from '../lib/server/db/client';
import {assertDeterministicTestMode} from '../tests/fixtures/runtime';
assertDeterministicTestMode();
if(process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.CONTEXT_API_KEY)throw Error('Unpaid fixture requires empty provider credentials');
const out=resolve('local-artifacts/020/native-specialists');await mkdir(out,{recursive:true,mode:0o700});
const sandboxOwner='turas-specialist-continuity-'+randomUUID();
try{await withPlanEvalEnvironment(async environment=>{
 environment.bootstrapDemo();
 const root=environment.appRoot;
 const agent=join(root,'agent/agent.ts'),source=await readFile(agent,'utf8');
 const target='return selectTurasGatewayModel(wrapOrdinaryChatModel(parityBudgetModel(gateway(selectedModel),selectedModel),principal,ctx.session.id,turnId));';
 if(source.split(target).length!==2)throw Error('Root selected model shape changed');
 await writeFile(agent,'import {specialistContinuityRoot} from "../tests/fixtures/specialist-continuity-model";\n'+source.replace(target,'return {...selectTurasGatewayModel(wrapOrdinaryChatModel(specialistContinuityRoot(principal,ctx.session.id),principal,ctx.session.id,turnId)),modelContextWindowTokens:128_000};'));
 const specialist=join(root,'agent/lib/authorize-specialist.ts');let worker=await readFile(specialist,'utf8');
 worker='import {specialistContinuityWorker} from "../../tests/fixtures/specialist-continuity-model";\n'+worker.replace("budgetedResearchModel('openai/gpt-5.6-terra')","specialistContinuityWorker(principal,parent,ctx.session.id,kind)").replace('kind,turnId,stepIndex,\n  });','kind,turnId,stepIndex,\n  },async()=>({input:0.0000025,output:0.000012,observedAt:new Date().toISOString()}));');
 worker=worker.replace('return guardSpecialistProvider(', 'const fixtureModel=guardSpecialistProvider(').replace('observedAt:new Date().toISOString()}));','observedAt:new Date().toISOString()}));\n  return {model:fixtureModel,modelContextWindowTokens:128_000};');
 await writeFile(specialist,worker);
 const fixtureCustomerIds=Array.from({length:6},()=>randomUUID());
 const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();
 try{await admin.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) SELECT seed.id,m.workspace_id,'Owned continuity fixture',false FROM unnest($1::uuid[]) seed(id) CROSS JOIN memberships m JOIN principals p ON p.id=m.principal_id WHERE p.login_name='panel' AND m.active",[fixtureCustomerIds]);await admin.query('CREATE TABLE specialist_continuity_calls(assignment_id uuid PRIMARY KEY REFERENCES specialist_assignments(id),worker_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp());CREATE TABLE specialist_continuity_started(assignment_id uuid PRIMARY KEY REFERENCES specialist_assignments(id),worker_id text NOT NULL);CREATE TABLE specialist_continuity_release(assignment_id uuid PRIMARY KEY REFERENCES specialist_assignments(id));GRANT SELECT,INSERT ON specialist_continuity_calls,specialist_continuity_started,specialist_continuity_release TO turas_runtime;');}finally{await admin.end();}
 const runtime=new URL(process.env.DATABASE_URL!);runtime.searchParams.set('options','-c role=turas_runtime');await closeRuntimePool();process.env.DATABASE_URL=runtime.href;process.env.DATABASE_URL_UNPOOLED=runtime.href;process.env.TURAS_SPECIALIST_CONTINUITY_FIXTURE='1';
 await environment.start();
 const browser=await webkit.launch({headless:true}),context=await browser.newContext({baseURL:environment.origin});let csrf='';
 async function until(check:()=>Promise<boolean>,label:string){const end=Date.now()+60000;while(Date.now()<end){if(await check())return;await new Promise(done=>setTimeout(done,100));}throw Error('Continuity timeout: '+label);}
 try{
  const login=await context.request.post('/api/auth/login',{headers:{origin:environment.origin},data:{username:'panel',password:process.env.PANEL_PASSWORD}});if(!login.ok())throw Error('Fixture login failed');csrf=(await login.json()).data.csrfToken;
  const headers=()=>({origin:environment.origin,'x-csrf-token':csrf});
  const receipts=[];
  const continuityKinds=process.argv.includes('--control-only')?[]:['customer-update','best-practices','solution'];
  for(const [caseIndex,kind] of continuityKinds.entries()){
   const customer=fixtureCustomerIds[caseIndex];
   const operationId=randomUUID();const created=await context.request.post('/api/conversations',{headers:headers(),data:{requestKey:operationId,customerId:customer}});if(!created.ok())throw Error('Fixture conversation creation failed');const id=(await created.json()).data.id;
   const binding=await context.request.post('/eve/v1/session',{headers:{...headers(),'x-turas-conversation-id':id},data:{operationId}});if(!binding.ok())throw Error('Native fixture binding failed');const native=(await binding.json()).sessionId;
   await context.request.get('/s/'+id,{timeout:90000});
   let identity:Record<string,unknown>|undefined;
   for(let ordinal=1;ordinal<=3;ordinal++){
    const response=await context.request.post('/eve/v1/session/'+native,{headers:{...headers(),'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message:`Continuity ${kind} ${ordinal}`}});if(!response.ok())throw Error('Native specialist send failed HTTP'+response.status());
    await until(async()=>{
     if((await query("SELECT 1 FROM response_attempts WHERE conversation_id=$1 AND response_state='failed'",[id])).rowCount)throw Error('Native parent failed before specialist completion');
     const rows=(await query(`SELECT a.state FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1 AND a.ordinal=$2`,[id,ordinal])).rows;
     if(rows.some(row=>['failed','unavailable','cancelled'].includes(row.state)))throw Error('Native specialist assignment failed: '+rows[0].state);
     return rows.length===1&&rows[0].state==='completed';
    },kind+' assignment '+ordinal);
    await until(async()=>!(await query("SELECT 1 FROM response_attempts WHERE conversation_id=$1 AND response_state IN('pending','running','waiting_input','stopping')",[id])).rowCount,'parent idle');
    const current=(await query('SELECT id,child_session_id,workflow_run_id,native_task_id,expires_at,input_ceiling,output_ceiling,cost_ceiling_micro_usd FROM specialist_discussions WHERE conversation_id=$1',[id])).rows;
    if(current.length!==1||!current[0].child_session_id||!current[0].native_task_id)throw Error('Persistent native bindings missing');
    const stable={...current[0],expires_at:current[0].expires_at.toISOString()};
    if(identity&&JSON.stringify(stable)!==JSON.stringify(identity))throw Error('Followup replaced specialist or renewed deadline');identity=stable;
    if(ordinal===1){await environment.restart();}
   }
   const calls=Number((await query('SELECT count(*)::int n FROM specialist_continuity_calls c JOIN specialist_assignments a ON a.id=c.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1',[id])).rows[0].n);
   if(calls!==3)throw Error('Duplicate or missing native worker dispatch');
   const published=kind==='customer-update'?Number((await query("SELECT count(*)::int n FROM evidence_source_revisions v JOIN evidence_sources s ON s.id=v.source_id WHERE v.customer_id=$1 AND s.origin='independent_research' AND NOT EXISTS(SELECT 1 FROM evidence_source_events e WHERE e.source_revision_id=v.id)",[customer])).rows[0].n):0;
   if(kind==='customer-update'&&published<1)throw Error('Native own-publication continuation did not retain canonical evidence');
   const accounting=(await query(`SELECT count(*)::int n,bool_and(o.actual_micro_usd IS NOT NULL AND o.actual_input_tokens IS NOT NULL AND o.actual_output_tokens IS NOT NULL) settled
    FROM specialist_operations o JOIN specialist_discussions d ON d.id=o.discussion_id WHERE d.conversation_id=$1`,[id])).rows[0];
   if(accounting.n!==3||!accounting.settled)throw Error('Native specialist accounting is incomplete or duplicated');
   const delivery=(await query(`SELECT max(extract(epoch FROM(a.result_delivered_at-c.created_at))*1000) AS ms,count(a.result_delivered_at)::int n FROM specialist_continuity_calls c
    JOIN specialist_assignments a ON a.id=c.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1`,[id])).rows[0];
   if(delivery.n!==3||Number(delivery.ms)>5000||Number(delivery.ms)<0)throw Error('Controlled native result handoff exceeded five seconds');
   const statuses=await context.request.get('/api/conversations/'+id+'/specialists');if(!statuses.ok())throw Error('Owned status failed');const items=(await statuses.json()).data.items;if(items.length!==1||!items[0].canContinue)throw Error('Completed task not available for refinement');
   const stopped=await context.request.post(`/api/conversations/${id}/specialists/${items[0].discussionId}/cancel`,{headers:headers(),data:{requestKey:randomUUID()}});if(!stopped.ok())throw Error('Targeted cancellation rejected HTTP'+stopped.status()+' '+((await stopped.json()).error?.code??''));
   await writeFile(join(out,'control-request-private.log'),environment.privateLogTail(),{mode:0o600});
   await until(async()=>!!(await query('SELECT 1 FROM specialist_discussions WHERE conversation_id=$1 AND closed_at IS NOT NULL',[id])).rowCount,'native idle task cancellation');
   receipts.push({kind,assignments:3,publicSourcesPublished:published,sameChild:true,sameWorkflow:true,fixedExpiry:true,restarted:true,targetedCancellation:true,paidCalls:0});
  }
  {
   const customer=fixtureCustomerIds[3];
   const operationId=randomUUID();const created=await context.request.post('/api/conversations',{headers:headers(),data:{requestKey:operationId,customerId:customer}});if(!created.ok())throw Error('Parallel conversation creation failed');const id=(await created.json()).data.id;
   const binding=await context.request.post('/eve/v1/session',{headers:{...headers(),'x-turas-conversation-id':id},data:{operationId}});if(!binding.ok())throw Error('Parallel native binding failed');const native=(await binding.json()).sessionId;
   const response=await context.request.post('/eve/v1/session/'+native,{headers:{...headers(),'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message:'Parallel continuity Stop'}});if(!response.ok())throw Error('Parallel send failed');
   await until(async()=>Number((await query(`SELECT count(*)::int n FROM specialist_continuity_started s JOIN specialist_assignments a ON a.id=s.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1`,[id])).rows[0].n)===2,'two active native specialist providers');
   const active=(await query(`SELECT d.id,d.kind,a.id AS assignment_id FROM specialist_discussions d JOIN specialist_assignments a ON a.discussion_id=d.id WHERE d.conversation_id=$1`,[id])).rows;
   const target=active.find(row=>row.kind==='customer-update'),other=active.find(row=>row.kind==='best-practices');if(!target||!other)throw Error('Parallel bindings missing');
   let lostAckKey='';
   const page=await context.newPage();
   await page.route(`**/api/conversations/${id}/specialists/${target.id}/cancel`,async route=>{
    lostAckKey=route.request().postDataJSON().requestKey;
    const accepted=await route.fetch();if(!accepted.ok())throw Error('Lost-ack control was rejected');
    await route.abort('failed');
   });
   await page.goto('/s/'+id,{waitUntil:'domcontentloaded'});
   const draft=page.getByLabel('Message Turi',{exact:true});await draft.fill('Preserve this draft while stopping one specialist.');
   const stop=page.getByRole('button',{name:'Stop Customer Research',exact:true});await stop.waitFor();await stop.focus();await page.keyboard.press('Enter');
   await until(async()=>!!(await query('SELECT 1 FROM specialist_discussions WHERE id=$1 AND closed_at IS NOT NULL',[target.id])).rowCount,'targeted active native stop');
   const stopped=(await query('SELECT state FROM specialist_assignments WHERE id=$1',[target.assignment_id])).rows[0];if(stopped.state!=='cancelled')throw Error('Active Stop lacked native terminal confirmation');
   if(!lostAckKey)throw Error('Lost acknowledgement was not exercised');
   const retried=await context.request.post(`/api/conversations/${id}/specialists/${target.id}/cancel`,{headers:headers(),data:{requestKey:lostAckKey}});
   if(retried.status()!==200||(await retried.json()).data.state!=='cancelled')throw Error('Identical Stop retry lost the actual terminal outcome');
   if((await query('SELECT state FROM specialist_assignments WHERE id=$1',[other.assignment_id])).rows[0].state!=='working')throw Error('Targeted Stop interrupted the other specialist');
   const held=(await query('SELECT actual_micro_usd,ceiling_micro_usd FROM specialist_operations WHERE assignment_id=$1',[target.assignment_id])).rows;if(held.length!==1||held[0].actual_micro_usd!==null||Number(held[0].ceiling_micro_usd)<=0)throw Error('Cancellation released unconfirmed provider usage');
   await query('INSERT INTO specialist_continuity_release(assignment_id) VALUES($1)',[other.assignment_id]);
   await until(async()=>(await query('SELECT state FROM specialist_assignments WHERE id=$1',[other.assignment_id])).rows[0].state==='completed','other specialist completion');
   await page.reload();await page.getByText('Customer Research — Stopped',{exact:true}).waitFor();
   if(await draft.inputValue()!=='Preserve this draft while stopping one specialist.')throw Error('Targeted Stop consumed the composer draft');
   await page.screenshot({path:join(out,'targeted-stop-webkit.png'),fullPage:true});await page.close();
   const close=await context.request.post(`/api/conversations/${id}/specialists/${other.id}/cancel`,{headers:headers(),data:{requestKey:randomUUID()}});if(!close.ok())throw Error('Parallel cleanup close rejected');
   await until(async()=>!!(await query('SELECT 1 FROM specialist_discussions WHERE id=$1 AND closed_at IS NOT NULL',[other.id])).rowCount,'other discussion closure');
   receipts.push({kind:'parallel-targeted-stop',assignments:2,sameChild:true,sameWorkflow:true,fixedExpiry:true,restarted:false,targetedCancellation:true,paidCalls:0});
  }
  {
   const customer=fixtureCustomerIds[4],operationId=randomUUID();
   const created=await context.request.post('/api/conversations',{headers:headers(),data:{requestKey:operationId,customerId:customer}});if(!created.ok())throw Error('Race conversation creation failed');const id=(await created.json()).data.id;
   const bound=await context.request.post('/eve/v1/session',{headers:{...headers(),'x-turas-conversation-id':id},data:{operationId}});if(!bound.ok())throw Error('Race binding failed');const native=(await bound.json()).sessionId;
   const sent=await context.request.post('/eve/v1/session/'+native,{headers:{...headers(),'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message:'Continuity best-practices 1 race'}});if(!sent.ok())throw Error('Race send failed');
   await until(async()=>!!(await query(`SELECT 1 FROM specialist_continuity_started s JOIN specialist_assignments a ON a.id=s.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1`,[id])).rowCount,'race provider started');
   const scope=(await query('SELECT d.id,a.id AS assignment_id FROM specialist_discussions d JOIN specialist_assignments a ON a.discussion_id=d.id WHERE d.conversation_id=$1',[id])).rows[0],requestKey=randomUUID();
   await Promise.all([query('INSERT INTO specialist_continuity_release(assignment_id) VALUES($1)',[scope.assignment_id]),context.request.post(`/api/conversations/${id}/specialists/${scope.id}/cancel`,{headers:headers(),data:{requestKey}})]);
   await until(async()=>!!(await query('SELECT 1 FROM specialist_discussions WHERE id=$1 AND closed_at IS NOT NULL',[scope.id])).rowCount,'completion versus Stop terminal proof');
   const state=(await query('SELECT state FROM specialist_assignments WHERE id=$1',[scope.assignment_id])).rows[0].state;
   if(!['completed','cancelled'].includes(state))throw Error('Completion race fabricated a terminal outcome');
   const retry=await context.request.post(`/api/conversations/${id}/specialists/${scope.id}/cancel`,{headers:headers(),data:{requestKey}});
   if(retry.status()!==200||(await retry.json()).data.state!==state)throw Error('Completion race retry rewrote the actual winner');
   receipts.push({kind:'completion-stop-race',assignments:1,sameChild:true,sameWorkflow:true,fixedExpiry:true,restarted:false,targetedCancellation:true,paidCalls:0});
  }
  {
   const customer=fixtureCustomerIds[5],operationId=randomUUID();
   const created=await context.request.post('/api/conversations',{headers:headers(),data:{requestKey:operationId,customerId:customer}});if(!created.ok())throw Error('Global Stop conversation creation failed');const id=(await created.json()).data.id;
   const bound=await context.request.post('/eve/v1/session',{headers:{...headers(),'x-turas-conversation-id':id},data:{operationId}});if(!bound.ok())throw Error('Global Stop binding failed');const native=(await bound.json()).sessionId;
   async function send(message:string){const response=await context.request.post('/eve/v1/session/'+native,{headers:{...headers(),'x-turas-conversation-id':id,'x-turas-request-key':randomUUID()},data:{message}});if(!response.ok())throw Error('Global Stop fixture send failed');}
   await send('Continuity solution 1');
   await until(async()=>!!(await query(`SELECT 1 FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1 AND a.state='completed'`,[id])).rowCount,'global idle specialist');
   await until(async()=>!(await query("SELECT 1 FROM response_attempts WHERE conversation_id=$1 AND response_state IN('pending','running','waiting_input','stopping')",[id])).rowCount,'global idle parent');
   await send('Global continuity Stop');
   await until(async()=>Number((await query(`SELECT count(*)::int n FROM specialist_continuity_started s JOIN specialist_assignments a ON a.id=s.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1`,[id])).rows[0].n)===2,'global two working specialists');
   const cancelled=await context.request.post(`/eve/v1/session/${native}/cancel`,{headers:{...headers(),'x-turas-conversation-id':id},data:{tasks:true}});if(!cancelled.ok())throw Error('Global Stop was rejected');
   await until(async()=>Number((await query('SELECT count(*)::int n FROM specialist_discussions WHERE conversation_id=$1 AND closed_at IS NOT NULL',[id])).rows[0].n)===3,'global closure including idle discussion');
   const states=(await query('SELECT a.state FROM specialist_assignments a JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1',[id])).rows.map(row=>row.state);
   if(states.filter(state=>state==='cancelled').length!==2||states.filter(state=>state==='completed').length!==1)throw Error('Global Stop rewrote completion or left active work');
   const holds=(await query('SELECT o.actual_micro_usd,o.ceiling_micro_usd FROM specialist_operations o JOIN specialist_assignments a ON a.id=o.assignment_id JOIN specialist_discussions d ON d.id=a.discussion_id WHERE d.conversation_id=$1 AND a.state=$2',[id,'cancelled'])).rows;
   if(holds.length!==2||holds.some(row=>row.actual_micro_usd!==null||Number(row.ceiling_micro_usd)<=0))throw Error('Global Stop refunded unconfirmed provider usage');
   receipts.push({kind:'global-stop-active-and-idle',assignments:3,sameChild:true,sameWorkflow:true,fixedExpiry:true,restarted:false,targetedCancellation:true,paidCalls:0});
  }
  await writeFile(join(out,'receipt.json'),JSON.stringify({passed:true,mode:process.argv.includes('--control-only')?'controls-only':'complete',cases:receipts},null,2),{mode:0o600});console.log(JSON.stringify({passed:true,continuityAssignments:continuityKinds.length*3,controlScenarios:3,paidCalls:0}));
 }catch(error){await writeFile(join(out,'failure-private.log'),environment.privateLogTail(),{mode:0o600});await writeFile(join(out,'failure-private.json'),JSON.stringify({message:error instanceof Error?error.message:String(error),discussions:(await query('SELECT * FROM specialist_discussions')).rows,assignments:(await query('SELECT * FROM specialist_assignments')).rows},null,2),{mode:0o600});throw error;}
 finally{await context.close();await browser.close();delete process.env.TURAS_SPECIALIST_CONTINUITY_FIXTURE;}
},{feature:'010',empty:true,deadlineAt:Date.now()+720000,prepare:async({appRoot})=>{
 for(const specialist of ['customer-recon-worker','implementation-research-worker','vercel-best-practices-worker'])
  await writeFile(join(appRoot,'agent/subagents',specialist,'sandbox.ts'),"import {defineParentSandbox} from 'eve/sandbox';export default defineParentSandbox();\n");
 await writeFile(join(appRoot,'agent/sandbox.ts'),`import {defineSandbox} from 'eve/sandbox';import {DockerSandbox} from 'eve/sandbox/docker';export const environment=DockerSandbox.image('pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f',{pullPolicy:'never',env:{TURAS_SPECIALIST_FIXTURE_OWNER:${JSON.stringify(sandboxOwner)}}});export default defineSandbox(()=>environment.open({networkPolicy:'deny-all'}));\n`);
 const path=join(appRoot,'scripts/dev.mjs');let source=await readFile(path,'utf8');
 // The documented --resume CLI owns this disposable app's retained local world.
 // withEve reuses that already-running local server. Do not enable automatic
 // recovery for the user's selected development database or workflow state.
 const launcher=`const ownedEve=spawn(resolve(cwd,'node_modules/.bin/eve'),['dev','--resume','--no-ui','--port','0'],{cwd,env:process.env,stdio:['ignore','pipe','pipe']});
let ownedOrigin='';
await new Promise((done,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Owned resume server timeout')),90000);const listen=chunk=>{const value=chunk.toString();process.stdout.write(value);text=(text+value).slice(-200000);const match=text.match(/server listening at (http:\\/\\/127\\.0\\.0\\.1:\\d+)\\//);if(match){ownedOrigin=match[1];clearTimeout(timer);done();}};ownedEve.stdout.on('data',listen);ownedEve.stderr.on('data',listen);ownedEve.once('exit',()=>{clearTimeout(timer);reject(Error('Owned resume server exited'));});});
`;
 source=source.replace('const next = spawn(',launcher+'const next = spawn(').replace('["dev"]','["dev","--webpack"]').replace('  next.kill("SIGTERM");','  next.kill("SIGTERM");\n  ownedEve.kill("SIGTERM");');
 source+='\nconsume("server listening at "+ownedOrigin+"/");\n';
 await writeFile(path,source);return {};
}});}finally{
 const docker=(args:string[])=>spawnSync('docker',args,{encoding:'utf8'});
 const ids=docker(['ps','-aq']).stdout.trim().split(/\s+/).filter(Boolean);
 let containers=0,images=0;
 for(const id of ids){const value=docker(['inspect',id]);if(value.status===0&&JSON.parse(value.stdout)[0]?.Config?.Env?.includes('TURAS_SPECIALIST_FIXTURE_OWNER='+sandboxOwner)){if(docker(['rm','-f','-v',id]).status!==0)throw Error('Owned specialist container cleanup failed');containers++;}}
 const candidates=[...new Set(docker(['image','ls','-q','--no-trunc']).stdout.trim().split(/\s+/).filter(Boolean))];
 for(const id of candidates){const value=docker(['image','inspect',id]);if(value.status===0&&JSON.parse(value.stdout)[0]?.Config?.Env?.includes('TURAS_SPECIALIST_FIXTURE_OWNER='+sandboxOwner)){if(docker(['ps','-aq','--filter','ancestor='+id]).stdout.trim())throw Error('Owned specialist image remains in use');if(docker(['image','rm','-f',id]).status!==0)throw Error('Owned specialist image cleanup failed');images++;}}
 await writeFile(join(out,'cleanup.json'),JSON.stringify({removedContainers:containers,removedImages:images}),{mode:0o600});
}
