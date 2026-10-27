import {runHostedStaffingBoundaries} from '../../../scripts/pilot-hosted-staffing-boundaries';
import {readHostedStaffingMatchPages} from '../../../scripts/pilot-hosted-staffing-match-pages';
import {staffingCreateResourceSchema} from '../../../lib/contracts/staffing';
import {staffingSha256} from '../../../lib/server/staffing/commands';
import {runHostedDeliveryReview} from '../../../scripts/pilot-hosted-delivery';
import {runHostedDeliveryTime} from '../../../scripts/pilot-hosted-delivery-time';
import {runHostedStaffingCommitment} from '../../../scripts/pilot-hosted-staffing';
import {runHostedProfileFoundation} from '../../../scripts/pilot-hosted-foundation';
import {runHostedPlanJourney} from '../../../scripts/pilot-hosted-plan';
import {retrievalResponseSchema} from '../../../lib/contracts/retrieval';
import {z} from 'zod';
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
async function proveMatchingPageGuards(){
 const expected={resultId:randomUUID(),demandId:randomUUID(),demandRevisionId:randomUUID(),inputDigest:'a'.repeat(64),expiresAt:new Date(Date.now()+60000).toISOString()};
 const item=()=>({resourceId:randomUUID(),status:'needs_review',constraints:[{kind:'required_skill',outcome:'unknown',reason:'stale',skillId:randomUUID()}]});
 const first={...expected,items:Array.from({length:50},item),nextCursor:'next-page'},last={...expected,items:[item()],nextCursor:null};
 async function read(pages:unknown[],signal=new AbortController().signal){let n=0;return readHostedStaffingMatchPages({expected,signal,request:async(path,method)=>{expect(method).toBe('GET');const query=new URL(path,'https://synthetic.invalid').searchParams;expect(query.get('resultId')).toBe(expected.resultId);expect(query.get('pageSize')).toBe('50');expect(query.get('cursor')).toBe(n===0?null:'next-page');return{data:pages[n++]};}});}
 expect(await read([first,last])).toHaveLength(51);
 for(const mutation of [{resultId:randomUUID()},{demandId:randomUUID()},{demandRevisionId:randomUUID()},{inputDigest:'b'.repeat(64)},{expiresAt:new Date(Date.now()+120000).toISOString()}])await expect(read([first,{...last,...mutation}])).rejects.toThrow();
 await expect(read([first,{...last,items:[first.items[0]]}])).rejects.toThrow('Duplicate staffing comparison resource');
 await expect(read([first,{...first,items:Array.from({length:50},item)}])).rejects.toThrow('Invalid or overflowing staffing comparison cursor');
 await expect(read([first,{...last,items:[],nextCursor:'other-page'}])).rejects.toThrow('made no progress');
 await expect(read([{...first,items:[item()]}])).rejects.toThrow('Invalid or overflowing staffing comparison cursor');
 await expect(read([{...first,items:Array.from({length:51},item)}])).rejects.toThrow();
 const expired={...expected,expiresAt:new Date(Date.now()-1).toISOString()};let expiredReads=0;
 await expect(readHostedStaffingMatchPages({expected:expired,signal:new AbortController().signal,request:async()=>{expiredReads++;throw Error('Must not read');}})).rejects.toThrow('expired');expect(expiredReads).toBe(0);
 const aborted=new AbortController();aborted.abort();await expect(read([last],aborted.signal)).rejects.toThrow();
 const duringRead=new AbortController();await expect(readHostedStaffingMatchPages({expected,signal:duringRead.signal,request:async()=>{duringRead.abort();return{data:last};}})).rejects.toThrow();
 const maximumPages=Array.from({length:10},(_,index)=>({...expected,items:Array.from({length:50},item),nextCursor:index===9?null:'page-'+index}));let maximumReads=0;
 expect(await readHostedStaffingMatchPages({expected,signal:new AbortController().signal,request:async()=>({data:maximumPages[maximumReads++]})})).toHaveLength(500);expect(maximumReads).toBe(10);
 const pages=Array.from({length:10},(_,index)=>({...expected,items:Array.from({length:50},item),nextCursor:'page-'+index}));let overflowReads=0;
 await expect(readHostedStaffingMatchPages({expected,signal:new AbortController().signal,request:async()=>({data:pages[overflowReads++]})})).rejects.toThrow('overflowing');expect(overflowReads).toBe(10);
}
it('reviews six located personnel cells through ordinary HTTP and keeps the original outside customer retrieval',async()=>{
 await proveMatchingPageGuards();
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
   const trace=z.object({files:z.array(z.string())}).parse(JSON.parse(await readFile(join(environment.appRoot,".next/server/app/api/staffing/resources/[resourceId]/calendar/route.js.nft.json"),"utf8")));
   expect(trace.files.some(file=>file.endsWith("/@js-temporal/polyfill/package.json"))).toBe(true);
   expect(trace.files.some(file=>file.endsWith("/@js-temporal/polyfill/dist/index.cjs"))).toBe(true);
   expect(trace.files.some(file=>file.includes("/jsbi/"))).toBe(true);
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
   const foundation=await runHostedProfileFoundation({scope,db:owner,customerId,signal:environment.signal,request});
   const retrieved=retrievalResponseSchema.parse(z.object({data:z.unknown()}).parse(await request('/api/retrieval/search','POST',{scope:'customer',customerId,workloadId:foundation.workloadId,query:'controlled synthetic workload serves synthetic public web requests',use:'discovery',limit:5})).data);
   const citation=retrieved.results.find(row=>row.sourceRevisionId===foundation.profileRevisionId);if(!citation)throw Error('Ordinary reviewed staffing plan source required');
   const plan=await runHostedPlanJourney({scope,db:owner,customerId,workloadId:foundation.workloadId,ownerMembershipId:membershipId,citationId:citation.citationId,expectedSourceRevisionId:foundation.profileRevisionId,signal:environment.signal,request});
   const committed=await runHostedStaffingCommitment({scope,db:owner,customerId,workloadId:foundation.workloadId,engagementId:plan.engagementId,planId:plan.planId,baselineId:plan.baselineId,planRevisionId:plan.revisionId,resourceId:result.resourceId,skillId:result.skillId,request,signal:environment.signal});
   expect(committed).toMatchObject({normalCommands:6,minutes:60,providerCalls:0,matchingIsNotConfirmationVerified:true,humanFeedbackRecorded:false});
   // Seed the owned pagination pool at fixture time; all boundary reads and decisions use ordinary HTTP.
   await owner.query('BEGIN');
   try{
    for(let index=0;index<51;index++){
     const input=staffingCreateResourceSchema.parse({requestKey:randomUUID(),rationale:'Controlled synthetic matching pagination fixture',resource:{displayName:'Synthetic matching page fixture '+index,externalKey:'synthetic-match-page-'+randomUUID(),kind:'internal',state:'active',membershipId:null,partnerOrganizationId:null,timezone:'UTC',regionCode:'US'}}),resourceId=randomUUID(),revisionId=randomUUID();
     await owner.query(`INSERT INTO workforce_resources(id,environment_id,workspace_id,external_key,kind,membership_id,partner_organization_id,active,created_by_membership_id) VALUES($1,$2,$3,$4,'internal',NULL,NULL,true,$5)`,[resourceId,environment.environmentId,workspaceId,input.resource.externalKey,membershipId]);
     await owner.query(`INSERT INTO workforce_resource_revisions(id,environment_id,workspace_id,resource_id,revision_number,content_digest,actor_membership_id) VALUES($1,$2,$3,$4,1,$5,$6)`,[revisionId,environment.environmentId,workspaceId,resourceId,staffingSha256(input.resource),membershipId]);
     await owner.query(`INSERT INTO workforce_resource_payloads(revision_id,display_name,timezone,region_code,rationale) VALUES($1,$2,$3,$4,$5)`,[revisionId,input.resource.displayName,input.resource.timezone,input.resource.regionCode,input.rationale]);
     await owner.query('UPDATE workforce_resources SET current_revision_id=$2,aggregate_version=1 WHERE id=$1',[resourceId,revisionId]);
    }
    await owner.query('COMMIT');
   }catch(error){await owner.query('ROLLBACK');throw error;}
   const pageReads:{resultId:string;inputDigest:string;resourceIds:string[];nextCursor:string|null}[]=[];
   const observedRequest:typeof request=async(path,method,body)=>{const value=await request(path,method,body);if(method==='GET'&&path.startsWith('/api/staffing/demands/'+committed.demandId+'/matches?')){const page=z.object({data:z.object({resultId:z.uuid(),inputDigest:z.string(),items:z.array(z.object({resourceId:z.uuid()})),nextCursor:z.string().nullable()})}).parse(value).data;pageReads.push({resultId:page.resultId,inputDigest:page.inputDigest,resourceIds:page.items.map(row=>row.resourceId),nextCursor:page.nextCursor});}return value;};
   const boundaries=await runHostedStaffingBoundaries({scope,db:owner,resourceId:result.resourceId,skillId:result.skillId,demandId:committed.demandId,allocationId:committed.allocationId,allocationRevisionId:committed.allocationRevisionId,serviceDate:committed.serviceDate,request:observedRequest,signal:environment.signal});
   expect(boundaries).toMatchObject({overloadDenied:true,staleSkillsDenied:true,staleMatchWithheld:true,originalCommitmentPreserved:true,deniedPreviews:2});
   expect(pageReads).toHaveLength(2);expect(pageReads[0].resourceIds).toHaveLength(50);expect(pageReads[0].nextCursor).toBeTypeOf('string');expect(pageReads[1].nextCursor).toBeNull();
   expect(new Set(pageReads.map(page=>page.resultId))).toEqual(new Set([boundaries.matchingResultId]));expect(new Set(pageReads.map(page=>page.inputDigest)).size).toBe(1);
   const matchingResources=pageReads.flatMap(page=>page.resourceIds);expect(matchingResources.length).toBeGreaterThan(50);expect(new Set(matchingResources).size).toBe(matchingResources.length);expect(matchingResources).toContain(boundaries.staleResourceId);
   const activity=await runHostedDeliveryReview({scope,db:owner,customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,signal:environment.signal,request});
   const time=await runHostedDeliveryTime({customerId,engagementId:plan.engagementId,baselineId:plan.baselineId,resourceId:result.resourceId,activityRevisionId:activity.revisionId,signal:environment.signal,reviewerRequest:request});
   expect(time).toMatchObject({normalCommands:3,replayedCommands:1,approvedMinutes:30,customerCompletionEstablished:false,providerCalls:0});
  }finally{await owner.end();await closeRuntimePool();}
 },{postgresMajor:18,deadlineMs:300000});
},300000);
