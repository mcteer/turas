import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {databaseTargetDigest,readOperationalDatabaseBinding} from '../../../lib/server/operations/database-binding';
import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {authenticateDemoPrincipal} from '../../../lib/server/auth/credentials';
import {issueSession,getCurrentSession,sessionCookieName,type CurrentSession} from '../../../lib/server/auth/sessions';
import {GET as ready} from '../../../app/api/health/ready/route';
import {GET as status} from '../../../app/api/operations/status/route';
import {createMcpConnection} from '../../../lib/server/mcp/management';
import {readOperationalHealth} from '../../../lib/server/operations/health';
import {createMaintenanceBindings} from '../../../lib/server/operations/maintenance-bindings';
import {runMaintenanceClass} from '../../../lib/server/operations/maintenance';
import {sandboxScopeDigest} from '../../../lib/server/jobs/governed';
import {costOperationDigest} from '../../../lib/contracts/pilot-cost';
import {withTransaction} from '../../../lib/server/db/client';
import {reserveServiceCost,serviceBudgetAuthority} from '../../../lib/server/operations/cost';
let owner:Client,admin:CurrentSession,member:CurrentSession,partner:CurrentSession;
const request=(token?:string)=>new Request(process.env.TURAS_APP_ORIGIN+'/api/operations/status',{headers:token?{cookie:`${sessionCookieName()}=${token}`}:{}});
async function login(name:'mcteer'|'panel'|'partner',password:string){const identity=await authenticateDemoPrincipal(name,password);if(!identity)throw Error('Actual fixture login required');const issued=await issueSession(identity);return (await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:`${sessionCookieName()}=${issued.token}`}})))!;}
/** Health scenarios own their queues; preceding upload suites retain theirs. */
async function fixture(run:()=>Promise<void>){
 await withPilotEnvironment(async()=>{
  owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{admin=await login('mcteer',process.env.TURAS_DEMO_PASSWORD!);member=await login('panel',process.env.PANEL_PASSWORD!);partner=await login('partner',process.env.PARTNER_PASSWORD!);await run();}finally{await owner.end();}
 },{postgresMajor:18,deadlineMs:120000});
}
/** Configured dependencies and real SQL budget state, without provider IO or
 * manufactured storage/image/backup execution observations. */
async function configureDispatch(){
 const scanner='a'.repeat(64),budgetId=randomUUID(),costSourceDigest='e'.repeat(64);
 Object.assign(process.env,{TURAS_JOB_EXECUTOR:'sandbox',TURAS_PRIVATE_OBJECT_BACKEND:'blob',BLOB_STORE_ID:'health-controlled',BLOB_READ_WRITE_TOKEN:'vercel_blob_rw_health-controlled_fixture',VERCEL_BLOB_RETRIES:'0',TURAS_PILOT_HOSTED_JOBS_ENABLED:'1',VERCEL_TOKEN:'synthetic-no-provider-token',VERCEL_PROJECT_ID:'prj_health',VERCEL_TEAM_ID:'team_health',TURAS_PILOT_SCANNER_IMAGE:'vcr.vercel.com/health/scanner@sha256:'+scanner,TURAS_PILOT_PARSER_IMAGE:'vcr.vercel.com/health/parser@sha256:'+'b'.repeat(64),TURAS_PILOT_RENDERER_IMAGE:'vcr.vercel.com/health/renderer@sha256:'+'c'.repeat(64),TURAS_PILOT_SCANNER_SIGNATURE_JSON:JSON.stringify({version:'1',builtAt:new Date().toISOString(),snapshotDigest:'f'.repeat(64),scannerDigest:scanner})});
 const scopeDigest=sandboxScopeDigest(),bounds={'artifact-scan':1,'artifact-parse':1,'workforce-parse':1,'report-render':1,'report-office-check':1},pricingDigest=costOperationDigest({contract:'pilot-sandbox-bounds-v1',costSourceDigest,bounds});
 process.env.TURAS_PILOT_JOB_COST_JSON=JSON.stringify({budgetId,scopeDigest,pricingDigest,costSourceDigest,bounds});
 await owner.query("INSERT INTO operations_cost_budgets(id,environment_id,category,authorization_digest,scope_digest,pricing_digest,cap_micro_usd,expires_at) VALUES($1,$2,'sandbox',$3,$4,$5,100,clock_timestamp()+interval '1 hour')",[budgetId,process.env.TURAS_ENVIRONMENT_ID,'a'.repeat(64),scopeDigest,pricingDigest]);
 return {budgetId,scopeDigest,pricingDigest,signature:process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON!};
}
it('public health returns only readiness and cannot write observation samples',async()=>fixture(async()=>{const before=(await owner.query('SELECT count(*)::int AS n FROM operations_health_samples')).rows[0].n;const response=await ready();expect(response.status).toBe(503);expect(await response.json()).toEqual({ready:false});expect((await owner.query('SELECT count(*)::int AS n FROM operations_health_samples')).rows[0].n).toBe(before);}),150000);

it('canonical admin receives bounded safe per-class diagnostics',async()=>fixture(async()=>{const response=await status(request(admin.token));expect(response.status).toBe(200);const body=await response.json();expect(body.data.database).toBe('healthy');expect(body.data.maintenance.classes).toHaveLength(15);expect(body.data.ready).toBe(false);expect(body.data.connectionBinding).toMatchObject({databaseBindingDigest:databaseTargetDigest(requireOwnedPilotDatabase(process.env,true),process.env.TURAS_ENVIRONMENT_ID!),schemaVersion:CURRENT_SCHEMA_VERSION,environmentId:process.env.TURAS_ENVIRONMENT_ID,effectiveRuntimeRole:true,directRuntimeLogin:true});expect(JSON.stringify(body)).not.toContain(requireOwnedPilotDatabase(process.env,true));expect(JSON.stringify(body).length).toBeLessThan(10000);
 await owner.query('BEGIN');try{await owner.query('SET LOCAL ROLE turas_runtime');const overridden=await readOperationalDatabaseBinding(owner as unknown as import('pg').PoolClient,{connection:requireOwnedPilotDatabase(process.env,true),environmentId:process.env.TURAS_ENVIRONMENT_ID!,codeVersion:process.env.TURAS_CODE_VERSION!});expect(overridden).toMatchObject({effectiveRuntimeRole:true,directRuntimeLogin:false});}finally{await owner.query('ROLLBACK');}
}),150000);

it('denies internal members partners bearer MCP and arbitrary admin headers',async()=>fixture(async()=>{for(const actor of [member,partner])expect((await status(request(actor.token))).status).toBe(403);const connection=await createMcpConnection(admin,{requestKey:randomUUID(),name:'Synthetic status scope denial',categories:['knowledge'],customerIds:[],lifetimeDays:1});if(!connection.secretAvailable)throw Error('Owned MCP credential required');const bearer=new Request(process.env.TURAS_APP_ORIGIN+'/api/operations/status',{headers:{authorization:`Bearer ${connection.credential}`,'x-role':'admin','x-principal-id':admin.principalId}});expect((await status(bearer)).status).toBe(401);expect((await status(request())).status).toBe(401);}),150000);

it('retains only exact canonical status access while recovery is locked',async()=>fixture(async()=>{await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);try{const response=await status(request(admin.token));expect(response.status).toBe(200);expect((await response.json()).data.admission).toBe('closed');expect((await status(request(member.token))).status).toBe(403);const ordinary=new Request(process.env.TURAS_APP_ORIGIN+'/api/auth/session',{headers:{cookie:`${sessionCookieName()}=${admin.token}`}});expect(await getCurrentSession(ordinary)).toBeNull();expect(await getCurrentSession(ordinary,'operations-status')).toBeNull();}finally{await owner.query("UPDATE operations_control SET mode='open',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);}}),150000);

it('missing classes and failed starts cannot establish completed maintenance',async()=>fixture(async()=>{expect((await readOperationalHealth()).maintenance?.healthy).toBe(false);const failed=await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,process.env.TURAS_CODE_VERSION!,{id:'mcp',enabled:true,tick:async()=>{throw Error('SYNTHETIC_PRIVATE_FAILURE_SENTINEL');},optional:false});expect(failed.state).toBe('fail');const health=await readOperationalHealth();expect(health.maintenance?.classes.find(c=>c.classId==='mcp')?.state).toBe('failed');expect(JSON.stringify(health)).not.toContain('SYNTHETIC_PRIVATE_FAILURE_SENTINEL');}),150000);

it('actual completed maintenance never substitutes for unverified infrastructure and backups',async()=>fixture(async()=>{
 for(const binding of createMaintenanceBindings())expect((await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,process.env.TURAS_CODE_VERSION!,binding)).state).toBe('pass');
 const configured=await configureDispatch(),health=await readOperationalHealth();
 expect(health.maintenance?.healthy).toBe(true);
 expect(health).toMatchObject({ready:true,stores:'unverified',images:'unverified',backups:'unverified',assurance:{ready:false,stores:'unverified',images:'unverified',backups:'unverified'}});
 const response=await ready();expect(response.status).toBe(200);expect(await response.json()).toEqual({ready:true});
 for(const table of ['operations_store_observations','operations_hosted_jobs','operations_backup_observations'])expect((await owner.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n).toBe(0);
 // Availability reads neither create observations nor require traffic to every namespace.
 process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON='{}';expect((await readOperationalHealth()).ready).toBe(false);
 process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON=JSON.stringify({...JSON.parse(configured.signature),builtAt:new Date(Date.now()-8*86400000).toISOString()});expect(await readOperationalHealth()).toMatchObject({dispatch:'unavailable'});
 process.env.TURAS_PILOT_SCANNER_SIGNATURE_JSON=configured.signature;
 await owner.query("UPDATE operations_maintenance_status SET last_success_at=clock_timestamp()-interval '1 minute',last_completed_at=clock_timestamp()-interval '1 minute' WHERE environment_id=$1 AND class_id='conversation'",[process.env.TURAS_ENVIRONMENT_ID]);
 const stale=await readOperationalHealth();expect(stale.ready).toBe(false);expect(stale.maintenance?.classes.find(c=>c.classId==='conversation')?.state).toBe('stale');
 await owner.query("UPDATE operations_maintenance_status SET last_success_at=clock_timestamp(),last_completed_at=clock_timestamp() WHERE environment_id=$1 AND class_id='conversation'",[process.env.TURAS_ENVIRONMENT_ID]);
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);
 expect((await readOperationalHealth()).ready).toBe(false);
 await owner.query("UPDATE operations_control SET mode='open',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);
 expect((await readOperationalHealth()).ready).toBe(true);
 const binding={budgetId:configured.budgetId,environmentId:process.env.TURAS_ENVIRONMENT_ID!,category:'sandbox' as const,scopeDigest:configured.scopeDigest,pricingDigest:configured.pricingDigest,operationDigest:'9'.repeat(64)};
 const reservation=await withTransaction(db=>reserveServiceCost(db,binding,1)),authority=serviceBudgetAuthority(binding);
 await withTransaction(async db=>{expect(await authority.verifyReserved(db,reservation,randomUUID())).toBe(true);await authority.markDispatch(db,reservation);await authority.holdUnknown(db,reservation);});
 expect((await readOperationalHealth()).ready).toBe(false);
}),150000);

it('requires exact supported schema and runtime restrictions before reporting database health',async()=>fixture(async()=>{await owner.query('UPDATE turas_environment SET schema_version=78');try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('UPDATE turas_environment SET schema_version=$1',[CURRENT_SCHEMA_VERSION]);}await owner.query('GRANT UPDATE ON operations_control TO turas_runtime');try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('REVOKE UPDATE ON operations_control FROM turas_runtime');}for(const attribute of ['CREATEDB','REPLICATION']){await owner.query('ALTER ROLE turas_runtime '+attribute);try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('ALTER ROLE turas_runtime NO'+attribute);}}
 await owner.query('GRANT CREATE ON DATABASE '+String((await owner.query('SELECT current_database() AS name')).rows[0].name)+' TO turas_runtime');try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('REVOKE CREATE ON DATABASE '+String((await owner.query('SELECT current_database() AS name')).rows[0].name)+' FROM turas_runtime');}
 await owner.query('CREATE ROLE pilot_test_owner NOLOGIN');await owner.query('GRANT postgres TO pilot_test_owner WITH INHERIT FALSE, SET TRUE');await owner.query('GRANT pilot_test_owner TO turas_runtime WITH INHERIT FALSE, SET TRUE');try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('REVOKE pilot_test_owner FROM turas_runtime');await owner.query('DROP ROLE pilot_test_owner');}
 for(const privilege of ['INSERT','UPDATE','DELETE']){await owner.query('GRANT '+privilege+' ON operations_recovery_quarantines TO turas_runtime');try{expect((await readOperationalHealth()).database).toBe('unavailable');}finally{await owner.query('REVOKE '+privilege+' ON operations_recovery_quarantines FROM turas_runtime');}}
 expect((await readOperationalHealth()).database).toBe('healthy');}),150000);

it('stalled queue age fails a fresh class without masking healthy independent classes',async()=>fixture(async()=>{for(const binding of createMaintenanceBindings())expect((await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,process.env.TURAS_CODE_VERSION!,binding)).state).toBe('pass');await owner.query("UPDATE operations_maintenance_status SET backlog_count=1,oldest_due_at=clock_timestamp()-interval '1 hour' WHERE environment_id=$1 AND class_id='mcp'",[process.env.TURAS_ENVIRONMENT_ID]);try{const response=await status(request(admin.token));expect(response.status).toBe(200);const health=(await response.json()).data;expect(health.maintenance.healthy).toBe(false);expect(health.maintenance.classes.find((c:{classId:string})=>c.classId==='mcp')).toMatchObject({state:'backlogged',backlog:1});expect(health.maintenance.classes.filter((c:{state:string})=>c.state==='healthy')).toHaveLength(14);expect(health.ready).toBe(false);}finally{await owner.query("UPDATE operations_maintenance_status SET backlog_count=0,oldest_due_at=NULL WHERE environment_id=$1 AND class_id='mcp'",[process.env.TURAS_ENVIRONMENT_ID]);}}),150000);

it('gap cleanup leaves queued preparation to the admitted dispatcher and cannot claim while locked',async()=>fixture(async()=>{
 const {prepareGapReport}=await import('../../../lib/server/gaps/reports');
 const {claimGapReportJobs}=await import('../../../lib/server/gaps/report-jobs');
 const {gapEnvelope}=await import('../../fixtures/gaps/authoring');
 const receipt=await prepareGapReport(member,{...gapEnvelope(),kind:'portfolio',gapIds:[],asOf:new Date().toISOString(),comparisonAt:null,audience:{team:'Synthetic engineering',recipients:['Synthetic engineer'],purpose:'Verify recovery admission'}});
 const binding=createMaintenanceBindings().find(row=>row.id==='gaps')!;
 expect(await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,process.env.TURAS_CODE_VERSION!,binding)).toEqual({state:'pass'});
 expect((await owner.query('SELECT state FROM gap_report_jobs WHERE id=$1',[receipt.resultId])).rows[0].state).toBe('queued');
 await owner.query("UPDATE operations_control SET mode='locked',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);
 try{
  expect(await runMaintenanceClass(process.env.TURAS_ENVIRONMENT_ID!,process.env.TURAS_CODE_VERSION!,binding)).toEqual({state:'pass'});
  await expect(claimGapReportJobs()).rejects.toMatchObject({code:'recovery_locked'});
  expect((await owner.query('SELECT state FROM gap_report_jobs WHERE id=$1',[receipt.resultId])).rows[0].state).toBe('queued');
 }finally{await owner.query("UPDATE operations_control SET mode='open',revision=revision+1 WHERE environment_id=$1",[process.env.TURAS_ENVIRONMENT_ID]);}
 expect((await claimGapReportJobs()).some(job=>job.id===receipt.resultId)).toBe(true);
}),150000);
