import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {sourceWithdrawalCommand} from './pilot-source-recipe';
import {pilotHostedRequest} from './pilot-hosted-request';
/** Normal original withdrawal followed by current authenticated withholding.
 * Original bytes/history are retained; no owner acceptance or provider replay. */
export async function runHostedSourceWithdrawal(input:{scope:PilotHostedScope;db:Client;headers:Headers;customerId:string;versionId:string;lifecycleGeneration:number;citationId:string;publicationId:string;artifactIds:string[];signal:AbortSignal;transport?:typeof fetch}){
 const {scope,db,signal}=input,transport=input.transport??fetch,request=pilotHostedRequest({...input,transport});
 for(const id of [input.customerId,input.versionId,input.citationId,input.publicationId,...input.artifactIds])z.uuid().parse(id);
 if(input.artifactIds.length!==4||new Set(input.artifactIds).size!==4)throw Error('Exact four published linked artifacts required');
 const rows=(await db.query("SELECT v.state,v.lifecycle_generation FROM artifact_versions v JOIN customer_references c ON c.id=v.customer_id AND c.workspace_id=v.workspace_id AND c.synthetic JOIN workspaces w ON w.id=c.workspace_id AND w.active AND w.classification='synthetic_pilot' AND w.pilot_environment_id=v.environment_id WHERE v.id=$1 AND v.environment_id=$2 AND v.workspace_id=$3 AND v.customer_id=$4",[input.versionId,scope.environmentMarker,scope.workspaceId,input.customerId])).rows;
 if(rows.length!==1||rows[0].state!=='ready'||Number(rows[0].lifecycle_generation)!==input.lifecycleGeneration)throw Error('Exact current synthetic original required before withdrawal');
 await request('/api/artifacts/'+input.versionId+'/actions','POST',sourceWithdrawalCommand(input.lifecycleGeneration));
 const after=(await db.query('SELECT state,lifecycle_generation FROM artifact_versions WHERE id=$1 AND environment_id=$2',[input.versionId,scope.environmentMarker])).rows[0];
 if(after?.state!=='withdrawn'||Number(after.lifecycle_generation)!==input.lifecycleGeneration+1)throw Error('Ordinary original withdrawal unconfirmed');
 const paths=['/api/retrieval/citations/'+input.citationId,'/api/knowledge/'+input.publicationId,...input.artifactIds.map(id=>'/api/reports/artifacts/'+id)];
 for(const path of paths){
  signal.throwIfAborted();const response=await transport(new URL(path,scope.origin),{headers:input.headers,redirect:'manual',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)])});
  await response.body?.cancel();if(![404,409].includes(response.status)||response.headers.get('x-turas-code-version')!==scope.sourceCommit)throw Error('Current linked source content was not withheld');
 }
 return {contract:'pilot-hosted-source-withdrawal-v1',versionId:input.versionId,lifecycleGeneration:input.lifecycleGeneration+1,normalCommands:1,authenticatedContentDenials:paths.length,providerCalls:0,originalDeletionRequested:false,fullHostedCatalogVerified:false};
}
