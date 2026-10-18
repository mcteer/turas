import {Client,type PoolClient} from 'pg';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {pilotFeedbackScopeSchema,validateFeedbackAppend,feedbackDigest} from '../lib/contracts/pilot-feedback';
import {operatorRecoveryDatabase} from './pilot-control';
import {createEvidenceDirectory,readEvidence,writeEvidence} from './pilot-evidence';
import {pilotSource} from './pilot-source';
/** Recheck current database identities and assignments. Supplied participant
 * names are private references, never authentication or assignment authority. */
export async function validatePilotFeedbackScope(db:Client|PoolClient,raw:unknown){
 const scope=pilotFeedbackScopeSchema.parse(raw);await db.query('BEGIN');
 try{
  await db.query("SET LOCAL transaction_timeout='15s'");await db.query("SET LOCAL statement_timeout='5000ms'");await db.query("SET LOCAL lock_timeout='3000ms'");
  const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
  const workspace=(await db.query("SELECT id FROM workspaces WHERE id=$1 AND active AND classification='synthetic_pilot' AND pilot_environment_id=$2 FOR SHARE",[scope.workspaceId,scope.environmentId])).rows;
  if(marker.length!==1||marker[0].environment_id!==scope.environmentId||marker[0].schema_version!==79||workspace.length!==1)throw Error('Current pilot feedback scope required');
  const customers=await db.query('SELECT id FROM customer_references WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND synthetic FOR SHARE',[scope.workspaceId,scope.customerIds]);
  if(customers.rowCount!==scope.customerIds.length)throw Error('Synthetic feedback customer scope differs');
  for(const participant of scope.participants){
   const membership=await db.query(`SELECT m.id FROM memberships m JOIN principals p ON p.id=m.principal_id LEFT JOIN partner_organizations o ON o.id=m.partner_org_id AND o.workspace_id=m.workspace_id
    WHERE m.id=$1 AND m.principal_id=$2 AND m.workspace_id=$3 AND m.kind=$4 AND m.active AND p.active AND (m.kind='internal' OR o.active) FOR SHARE OF m,p`,[participant.membershipId,participant.principalId,scope.workspaceId,participant.kind]);
   if(membership.rowCount!==1)throw Error('Current distinct participant membership required');
   if(participant.kind==='partner'){
    const grants=await db.query("SELECT customer_id FROM customer_grants WHERE membership_id=$1 AND workspace_id=$2 AND customer_id=ANY($3::uuid[]) AND state='active' FOR SHARE",[participant.membershipId,scope.workspaceId,scope.customerIds]);
    if(grants.rowCount!==scope.customerIds.length)throw Error('Explicit partner assignments required');
   }
  }
  await db.query('COMMIT');return scope;
 }catch(error){await db.query('ROLLBACK');throw error;}
}
const requestSchema=z.strictObject({record:z.unknown(),previous:z.strictObject({file:z.string().min(1),digest:z.string().regex(/^[a-f0-9]{64}$/)}).optional()});
export async function pilotFeedback(args=process.argv.slice(2)){
 if(args.length!==6||args[0]!=='--environment'||args[2]!=='--input'||args[4]!=='--output')throw Error('Explicit feedback environment, private input and new output required');
 const file=resolve(args[3]),request=requestSchema.parse(await readEvidence(dirname(file),basename(file))),previousFile=request.previous?resolve(dirname(file),request.previous.file):null;
 const previous=previousFile?await readEvidence(dirname(previousFile),basename(previousFile),request.previous!.digest):undefined;
 const record=validateFeedbackAppend(request.record,previous),source=await pilotSource();
 if(record.scope.environmentId!==args[1]||record.sourceCommit!==source.sourceCommit||record.sourceDigest!==source.sourceDigest||record.catalogDigest!==source.catalogDigest)throw Error('Exact current feedback target and source required');
 const database=operatorRecoveryDatabase(args[1]),root=resolve(args[5]);await createEvidenceDirectory(root);
 const db=new Client({connectionString:database,connectionTimeoutMillis:5000});
 try{
  await db.connect();await validatePilotFeedbackScope(db,record.scope);const current=await pilotSource();
  if(JSON.stringify(current)!==JSON.stringify(source))throw Error('Feedback source changed');
  const fileDigest=await writeEvidence(root,'feedback.json',record);
  console.info(JSON.stringify({recorded:true,state:record.transitions.at(-1)!.state,recordDigest:feedbackDigest(record),fileDigest,humanReported:true,releaseApproved:false,messagesSent:0}));
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotFeedback().catch(()=>{console.error('Feedback recording refused; no feedback or release decision was invented.');process.exitCode=1;});
