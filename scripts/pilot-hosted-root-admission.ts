import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {Client} from 'pg';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {PoolClient} from 'pg';
import {conversationFeature} from '../lib/server/conversations/feature';
import {pilotHostedScopeSchema} from '../lib/contracts/pilot-hosted';
import {hostedRootBudgetSchema} from '../lib/server/conversations/hosted-root-budget';
import {readEvidence,createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
import {platformDeployment} from './pilot-hosted';

/** Post-READY owner admission only. This command neither creates a budget nor
 * sends a native message, changes deployment configuration, or resets charges. */
export async function pilotHostedRootAdmission(args=process.argv.slice(2)){
 if(args.length!==6||args[0]!=='--scope'||args[2]!=='--binding'||args[4]!=='--output')throw Error('Exact private scope, root binding and new output required');
 process.umask(0o077);
 if(execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024}).trim())throw Error('Committed clean source required');
 const read=async(file:string)=>{const path=resolve(file);return readEvidence(dirname(path),basename(path));};
 const scope=pilotHostedScopeSchema.parse(await read(args[1])),binding=hostedRootBudgetSchema.parse(await read(args[3]));
 const source=await pilotSource();
 if(scope.sourceCommit!==binding.sourceCommit||scope.workspaceId!==binding.workspaceId||scope.target!==binding.target
  ||scope.projectId!==binding.projectId||scope.environmentMarker!==binding.environmentMarker
  ||(['sourceCommit','sourceDigest','catalogDigest'] as const).some(key=>scope[key]!==source[key])
  ||Date.parse(binding.recordedAt)>Date.now()||Date.parse(binding.expiresAt)<=Date.now())throw Error('Exact fresh committed target binding required');
 const raw=process.env.TURAS_PILOT_HOSTED_OWNER_DATABASE_URL;
 if(!raw)throw Error('Explicit hosted owner connection required');
 const url=new URL(raw);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname.endsWith('.neon.tech')||url.hostname.includes('-pooler.')||url.searchParams.get('sslmode')!=='verify-full')throw Error('Explicit direct Neon verify-full owner connection required');
 const signal=AbortSignal.timeout(60000),deployment=await platformDeployment(scope,false,signal);
 await platformDeployment(scope,true,signal);
 const root=resolve(args[5]);await createEvidenceDirectory(root);
 const db=new Client({connectionString:raw,connectionTimeoutMillis:5000,statement_timeout:5000});
 const bindingDigest=createHash('sha256').update(JSON.stringify(binding)).digest('hex');
 try{
  await db.connect();await db.query('BEGIN');await db.query("SET LOCAL transaction_timeout='30s'");
  const marker=(await db.query(`SELECT e.environment_id,e.schema_version,c.mode,
   current_user=pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='parity_evaluation_budgets'::regclass)) AS owner
   FROM turas_environment e JOIN operations_control c USING(environment_id)`)).rows;
  if(marker.length!==1||marker[0].environment_id!==scope.environmentMarker||marker[0].schema_version!==CURRENT_SCHEMA_VERSION||marker[0].mode!=='open'||marker[0].owner!==true)throw Error('Actual open owner target at current schema required');
  const budget=(await db.query('SELECT * FROM parity_evaluation_budgets WHERE id=$1 FOR UPDATE',[binding.budgetId])).rows[0];
  if(!budget||budget.environment_id!==scope.environmentMarker||budget.workspace_id!==scope.workspaceId||budget.owner_principal_id!==binding.ownerPrincipalId
   ||Number(budget.cap_micro_usd)!==binding.capMicroUsd||budget.state!=='open'||budget.expires_at.getTime()<=Date.now()||budget.expires_at.getTime()>Date.parse(binding.expiresAt))throw Error('Existing original scoped budget required');
  const existing=(await db.query('SELECT deployment_id,binding_digest FROM operations_hosted_root_admissions WHERE budget_id=$1 AND deployment_id=$2',[binding.budgetId,scope.deploymentId])).rows[0];
  if(existing){if(existing.deployment_id!==scope.deploymentId||existing.binding_digest!==bindingDigest)throw Error('Original hosted admission cannot be replaced');}
  else{
   const original=(await db.query('SELECT 1 FROM operations_hosted_root_admissions WHERE budget_id=$1 LIMIT 1',[binding.budgetId])).rowCount;
   if(!original&&(BigInt(budget.reserved_micro_usd)!==0n||(await db.query('SELECT 1 FROM parity_evaluation_operations WHERE budget_id=$1 LIMIT 1',[binding.budgetId])).rowCount))throw Error('Fresh budget required for initial admission; preserve existing holds');
   if((await db.query('SELECT 1 FROM parity_evaluation_operations WHERE budget_id=$1 AND settled_at IS NULL LIMIT 1',[binding.budgetId])).rowCount)throw Error('Original uncertain provider reservations require reconciliation');
   const rows=(await db.query(`SELECT c.id FROM conversations c JOIN workspaces w ON w.id=c.workspace_id
    JOIN principals p ON p.id=c.owner_principal_id
    WHERE c.id=ANY($1::uuid[]) AND c.workspace_id=$2 AND c.environment_id=$3 AND c.owner_principal_id=$4
     AND c.archived_at IS NULL AND c.binding_state='unbound' AND c.eve_session_id IS NULL
     AND c.created_at<=$5::timestamptz AND w.active AND p.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=$3
     AND NOT EXISTS(SELECT 1 FROM response_attempts a WHERE a.conversation_id=c.id)`,
    [binding.conversationIds,binding.workspaceId,binding.environmentMarker,binding.ownerPrincipalId,binding.recordedAt])).rows;
   if(rows.length!==binding.conversationIds.length)throw Error('Fresh precreated owned ordinary synthetic conversations required');
   for(const row of rows)if((await conversationFeature(db as unknown as PoolClient,row.id)).kind!=='normal')throw Error('Ordinary root transport conversations required');
   await db.query('INSERT INTO operations_hosted_root_admissions(budget_id,deployment_id,binding_digest) VALUES($1,$2,$3)',[binding.budgetId,scope.deploymentId,bindingDigest]);
  }
  await db.query('COMMIT');
  const receipt={contract:'pilot-hosted-root-admission-receipt-v1',...source,environmentMarker:scope.environmentMarker,target:scope.target,deployment,budgetId:binding.budgetId,bindingDigest,capMicroUsd:binding.capMicroUsd,originalReservedMicroUsd:String(budget.reserved_micro_usd),expiresAt:binding.expiresAt,admissionAlreadyPresent:!!existing,recordedAt:new Date().toISOString(),modelCalls:0,billingChanges:0,rootTransportVerified:false,fullHostedCatalogVerified:false};
  await writeEvidence(root,'admission.json',receipt);return receipt;
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotHostedRootAdmission().then(()=>console.info('Exact hosted root admission recorded; no model dispatched')).catch(()=>{console.error('Hosted root admission failed; private configuration retained');process.exitCode=1;});
