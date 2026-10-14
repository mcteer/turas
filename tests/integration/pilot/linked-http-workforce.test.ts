import {it,expect} from 'vitest';
import {Client} from 'pg';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,cp,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {parsePilotImagePreparation} from '../../../lib/contracts/pilot-images';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
import {withPilotEnvironment,requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {runSyntheticWorkforceRecipe} from '../../../scripts/pilot-workforce-recipe';
import {uploadPilotOriginal} from '../../../scripts/pilot-original-upload';
import {pilotHostedRequest} from '../../../scripts/pilot-hosted-request';
import {claimWorkforceImport} from '../../../lib/server/staffing/jobs';
import {runWorkforceImport} from '../../../lib/server/staffing/runner';
import {issueSession,sessionCookieName} from '../../../lib/server/auth/sessions';
import {csrfTokenForSession} from '../../../lib/server/auth/csrf';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {DEMO_IDS} from '../../../lib/server/bootstrap-ids';
it('reviews six located personnel cells through ordinary HTTP and keeps the original outside customer retrieval',async()=>{
 const preparationFile=process.env.TURAS_PILOT_UI_PREPARATION_FILE;if(!preparationFile)throw Error('Explicit prepared workforce images required');
 const preparation=parsePilotImagePreparation(await readFile(preparationFile)),preparedStore=join(dirname(preparationFile),'store');
 await withPilotEnvironment(async environment=>{
  const parser=preparation.images.find(row=>row.kind==='parser')!,scanner=preparation.images.find(row=>row.kind==='scanner')!;
  process.env.TURAS_PILOT_PARSER_IMAGE=parser.localImageId;process.env.TURAS_PILOT_SCANNER_IMAGE=scanner.localImageId;
  await cp(join(preparedStore,'signatures'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'signatures'),{recursive:true});
  await cp(join(preparedStore,'assets'),join(process.env.TURAS_ARTIFACT_STORE_ROOT!,'assets'),{recursive:true});
  await writeFile(join(process.env.TURAS_WORKFORCE_STORE_ROOT!,'runtime-images.json'),JSON.stringify({contract:'workforce-table-v1',environmentId:environment.environmentId,parserImage:parser.localImageId,parserDigest:parser.localImageId.slice(7),scannerImage:scanner.localImageId,scannerDigest:scanner.localImageId.slice(7)}),{mode:0o600});
  const owner=new Client({connectionString:requireOwnedPilotDatabase(process.env,true)});await owner.connect();
  try{
   const workspaceId=randomUUID(),membershipId=randomUUID(),customerId=randomUUID();
   await owner.query("INSERT INTO workspaces(id,name,classification,pilot_environment_id,pilot_provisioning_id) VALUES($1,'Synthetic normal workforce HTTP','synthetic_pilot',$2,$3)",[workspaceId,environment.environmentId,randomUUID()]);
   await owner.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role) VALUES($1,$2,$3,'internal','admin')",[membershipId,DEMO_IDS.mcteer,workspaceId]);
   await owner.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Synthetic workforce privacy customer',true)",[customerId,workspaceId]);
   const issued=await issueSession({principalId:DEMO_IDS.mcteer,loginName:'mcteer',displayName:'mcteer',membershipId,workspaceId,kind:'internal',role:'admin'});
   const headers=new Headers({cookie:sessionCookieName()+'='+issued.token,origin:environment.origin,'content-type':'application/json','x-csrf-token':csrfTokenForSession(issued.token)});
   const scope={contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_synthetic',teamId:'team_synthetic',deploymentId:'dpl_synthetic',origin:environment.origin,environmentMarker:environment.environmentId,workspaceId,target:'preview',sourceCommit:process.env.TURAS_CODE_VERSION!,sourceDigest:'a'.repeat(64),catalogDigest:'b'.repeat(64)} as PilotHostedScope;
   await closeRuntimePool();await environment.startProduction();
   const request=pilotHostedRequest({scope,headers,signal:environment.signal});
   const result=await runSyntheticWorkforceRecipe({scope,db:owner,signal:environment.signal,request,
    uploadOriginal:async(importId,bytes)=>uploadPilotOriginal({scope,headers,domain:'workforce',id:importId,bytes,contentType:'text/csv',signal:environment.signal,requireBlob:false}),
    runQueuedImport:async sourceVersionId=>{const claim=await claimWorkforceImport();if(!claim||claim.sourceVersionId!==sourceVersionId)throw Error('Exact normal workforce queue head required');await runWorkforceImport(claim,environment.signal);},
    readOriginal:async(importId,expected)=>{const response=await fetch(environment.origin+'/api/staffing/imports/'+importId+'/content',{headers,redirect:'manual',signal:environment.signal});expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe(scope.sourceCommit);const actual=Buffer.from(await response.arrayBuffer());expect(actual.length).toBe(expected.length);expect(createHash('sha256').update(actual).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));},
   });
   expect(result).toMatchObject({locatedCells:6,originalBytesVerified:true,normalCommands:6,modelCalls:0,staffingCommitmentVerified:false,skillsCertified:false,fullWorkforceJourneyVerified:false});
   expect((await owner.query("SELECT count(*)::int AS n FROM retrieval_sources WHERE workspace_id=$1 AND source_revision_id=$2",[workspaceId,result.sourceVersionId])).rows[0].n).toBe(0);
   expect((await owner.query('SELECT count(*)::int AS n FROM profile_revisions WHERE workspace_id=$1',[workspaceId])).rows[0].n).toBe(0);
   const search=await request('/api/retrieval/search','POST',{scope:'customer',customerId,query:'PRIVATE_SYNTHETIC_PILOT_PERSONNEL_EVIDENCE',use:'discovery',limit:5}) as {data:{results:unknown[]}};expect(search.data.results).toEqual([]);
  }finally{await owner.end();await closeRuntimePool();}
 },{postgresMajor:18,deadlineMs:300000});
},300000);
