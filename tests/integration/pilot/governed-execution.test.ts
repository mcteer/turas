import {beforeAll,afterAll,beforeEach,afterEach,it,expect,vi} from 'vitest';
import {Client} from 'pg';import {randomUUID} from 'node:crypto';import {Readable} from 'node:stream';
const fixture=vi.hoisted(()=>({create:vi.fn(),unknown:false}));
vi.mock('@vercel/sandbox',()=>({Sandbox:{create:async(options:unknown)=>{if(fixture.unknown){fixture.create(options);throw Error('Controlled lost response');}return fixture.create(options);}}}));
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {withTransaction,closeRuntimePool} from '../../../lib/server/db/client';
import {createProfileTestSession} from '../../fixtures/profiles';
import {createArtifactDatabaseFixture} from '../../fixtures/artifact-database';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
import {claimArtifactRun,heartbeatArtifactRun,publishArtifactRun,type ArtifactJobClaim} from '../../../lib/server/artifacts/jobs';
import {runGovernedExecution,sandboxScopeDigest,hostedCostConfiguration} from '../../../lib/server/jobs/governed';
import {sha256,type ExecutionRequest} from '../../../lib/server/jobs/executor';
import {costOperationDigest} from '../../../lib/contracts/pilot-cost';
import {reserveServiceCost,serviceBudgetAuthority} from '../../../lib/server/operations/cost';
import {readHostedDispatchHealth} from '../../../lib/server/operations/capacity-health';
const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)}),digest='a'.repeat(64);
const original={...process.env};beforeAll(()=>owner.connect());afterAll(async()=>{await owner.end();await closeRuntimePool();});
beforeEach(async()=>{fixture.create.mockReset();fixture.unknown=false;
 await owner.query("UPDATE artifact_extraction_runs SET state='cancelled',attempt_token=NULL,lease_expires_at=NULL WHERE state='leased'");
 await owner.query("UPDATE operations_hosted_jobs SET state='reconciling' WHERE state IN('starting','running')");await owner.query("UPDATE operations_hosted_jobs SET state='cancelled',finished_at=clock_timestamp() WHERE state IN('admitted','reconciling')");
 Object.assign(process.env,{TURAS_JOB_EXECUTOR:'sandbox',VERCEL_TOKEN:'CONTROLLED_FIXTURE_ONLY',VERCEL_PROJECT_ID:'controlled-project',VERCEL_TEAM_ID:'controlled-team',TURAS_PILOT_SCANNER_IMAGE:'vcr.vercel.com/controlled/scanner@sha256:'+digest,TURAS_PILOT_PARSER_IMAGE:'vcr.vercel.com/controlled/parser@sha256:'+digest,TURAS_PILOT_RENDERER_IMAGE:'vcr.vercel.com/controlled/renderer@sha256:'+digest});
 Object.assign(process.env,{BLOB_STORE_ID:'controlled-store',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_controlled-store_fixture',VERCEL_BLOB_RETRIES:'0',TURAS_PILOT_SCANNER_SIGNATURE_JSON:JSON.stringify({version:'28149',builtAt:new Date().toISOString(),snapshotDigest:digest,scannerDigest:digest})});
 const id=randomUUID(),scopeDigest=sandboxScopeDigest(),bounds={'artifact-scan':100000,'artifact-parse':100000,'workforce-parse':100000,'report-render':100000,'report-office-check':100000},pricingDigest=costOperationDigest({contract:'pilot-sandbox-bounds-v1',costSourceDigest:digest,bounds});
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$4,$5,1000000,clock_timestamp()+interval '1 hour')",[id,process.env.TURAS_ENVIRONMENT_ID,digest,scopeDigest,pricingDigest]);
 process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify({budgetId:id,scopeDigest,pricingDigest,costSourceDigest:digest,bounds});
});
afterEach(()=>{for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];Object.assign(process.env,original);});
async function artifact(){return withTransaction(async db=>{const actor=await createProfileTestSession(db,'mcteer'),f=await createArtifactDatabaseFixture(db,actor,DEMO_IDS.sharedCustomer);await db.query('UPDATE artifact_extraction_runs SET parser_image_digest=$2 WHERE id=$1',[f.runId,digest]);const claim=await claimArtifactRun(db);if(!claim)throw Error('Synthetic domain claim required');return {...f,claim};});}
function setup(claim:ArtifactJobClaim,afterCompute=async()=>{}){
 const bytes=Buffer.from('Synthetic artifact'),receipt={contract:'artifact-intake-v1' as const,originalDigest:sha256(bytes),engineVersion:'controlled',signatureVersion:'28149',scanPolicyVersion:'004-v1',scannedAt:new Date().toISOString(),result:'clean' as const};
 const manifest={contract:'artifact-intake-v1',originalDigest:sha256(bytes),parserVersion:'004-v1',imageDigest:digest,scanReceiptDigest:sha256(Buffer.from(JSON.stringify(receipt))),format:'txt',status:'ready',coverage:{total:1,visited:1,omitted:[]},units:[{id:randomUUID(),ordinal:1,text:'Synthetic artifact',locator:{kind:'txt',lineStart:1,lineEnd:1},origin:'native',ocrConfidence:null}],warnings:[]};
 const stopped=vi.fn(async()=>({})),deleted=vi.fn(async()=>{});fixture.create.mockImplementation(async(options:{name:string;tags:Record<string,string>})=>({name:options.name,tags:options.tags,persistent:false,routes:[],networkPolicy:'deny-all',mkDir:async()=>{},writeFiles:async()=>{},readFile:async()=>Readable.from([bytes]),runCommand:async()=>({logs:()=>Object.assign((async function*(){yield {stream:'stdout',data:JSON.stringify(manifest)};})(),{close:()=>{}}),wait:async()=>{await afterCompute();return {exitCode:0};}}),stop:stopped,delete:deleted}));
 const request:ExecutionRequest={id:randomUUID(),kind:'artifact-parse',image:process.env.TURAS_PILOT_PARSER_IMAGE!,imageDigest:digest,deadlineAt:claim.deadlineAt,inputs:[{name:'original',bytes,sizeBytes:bytes.length,digest:sha256(bytes)}],parser:{filename:'synthetic.txt',mime:'text/plain',scanReceiptDigest:manifest.scanReceiptDigest}};
 const input={request,domain:{domainKind:'artifact' as const,domainJobId:claim.runId,sourceGeneration:claim.lifecycleGeneration,sourceDigest:claim.originalDigest},localAssets:{signaturesPath:'',ocrAssetsPath:''},sourceCurrent:(db:import('pg').PoolClient)=>heartbeatArtifactRun(claim,db),complete:async(db:import('pg').PoolClient,output:import('../../../lib/server/jobs/executor').ExecutionOutput)=>publishArtifactRun(claim,JSON.parse(output.stdout.toString()),receipt,db)};
 return {input,stopped,deleted};
}
it('publishes a source-fenced domain result and records one reserved dispatch',async()=>{const f=await artifact(),s=setup(f.claim);await runGovernedExecution(s.input);expect((await owner.query('SELECT state FROM artifact_versions WHERE id=$1',[f.versionId])).rows[0].state).toBe('ready');expect((await owner.query('SELECT state FROM operations_hosted_jobs WHERE domain_job_id=$1',[f.runId])).rows[0].state).toBe('succeeded');expect(fixture.create).toHaveBeenCalledOnce();expect(s.stopped).toHaveBeenCalledOnce();expect(s.deleted).toHaveBeenCalledOnce();});
it('holds an unknown creation and refuses another paid dispatch',async()=>{const f=await artifact(),s=setup(f.claim);fixture.unknown=true;await expect(runGovernedExecution(s.input)).rejects.toThrow('creation uncertain');await expect(runGovernedExecution(s.input)).rejects.toThrow('authority unavailable');expect(fixture.create).toHaveBeenCalledOnce();expect((await owner.query('SELECT state FROM operations_cost_reservations WHERE budget_id=$1',[hostedCostConfiguration().budgetId])).rows[0].state).toBe('unknown');});
it('withholds computed output after current source withdrawal',async()=>{const f=await artifact(),s=setup(f.claim,async()=>{await owner.query("UPDATE artifact_versions SET state='withdrawn',lifecycle_generation=lifecycle_generation+1 WHERE id=$1",[f.versionId]);});await expect(runGovernedExecution(s.input)).rejects.toThrow('lease lost');expect((await owner.query('SELECT count(*)::int AS n FROM artifact_extraction_units WHERE version_id=$1',[f.versionId])).rows[0].n).toBe(0);expect(s.deleted).toHaveBeenCalledOnce();});
it('rejects changed provider or price scope before provider creation',async()=>{
 const f=await artifact(),s=setup(f.claim);process.env.VERCEL_PROJECT_ID='foreign-project';await expect(runGovernedExecution(s.input)).rejects.toThrow('scope differs');
 process.env.VERCEL_PROJECT_ID='controlled-project';const config=JSON.parse(process.env.TURAS_PILOT_JOB_COST_JSON!);config.maximumDispatches=1;
 process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify(config);expect(()=>hostedCostConfiguration()).toThrow('scope differs');
 config.pricingDigest=costOperationDigest({contract:'pilot-sandbox-bounds-v1',costSourceDigest:config.costSourceDigest,bounds:config.bounds,maximumDispatches:1});
 config.budgetId=randomUUID();
 process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify(config);expect(hostedCostConfiguration().maximumDispatches).toBe(1);
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$4,$5,1000000,clock_timestamp()+interval '1 hour')",[config.budgetId,process.env.TURAS_ENVIRONMENT_ID,digest,config.scopeDigest,config.pricingDigest]);
 Object.assign(process.env,{TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',TURAS_PRIVATE_OBJECT_BACKEND:'blob'});
 expect(await readHostedDispatchHealth(owner as unknown as import('pg').PoolClient,process.env.TURAS_ENVIRONMENT_ID!)).toBe('ready');
 const binding={budgetId:config.budgetId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,category:'sandbox' as const,scopeDigest:config.scopeDigest,pricingDigest:config.pricingDigest,operationDigest:digest,maximumDispatches:1};
 const reservation=await withTransaction(db=>reserveServiceCost(db,binding,100000));
 expect(await readHostedDispatchHealth(owner as unknown as import('pg').PoolClient,binding.environmentId)).toBe('unavailable');
 await withTransaction(db=>serviceBudgetAuthority(binding).releaseUndispatched(db,reservation));
 expect(await readHostedDispatchHealth(owner as unknown as import('pg').PoolClient,binding.environmentId)).toBe('ready');
 for(const maximumDispatches of [2,undefined]){process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify({...config,maximumDispatches});expect(()=>hostedCostConfiguration()).toThrow('scope differs');}
 expect(fixture.create).not.toHaveBeenCalled();
});
