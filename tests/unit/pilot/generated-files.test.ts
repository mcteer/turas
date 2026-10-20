import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {randomUUID,createHash} from 'node:crypto';
import {mkdtemp,realpath,rm,writeFile} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import type {Client} from 'pg';
const hooks=vi.hoisted(()=>({target:vi.fn(),restart:vi.fn(),paid:vi.fn(),journey:vi.fn()}));
vi.mock('../../../scripts/pilot-hosted-maximum-files',()=>({assertHostedFileTarget:hooks.target,verifyHostedFileRestart:hooks.restart}));
vi.mock('../../../scripts/pilot-hosted-paid',()=>({verifyHostedPaidJobs:hooks.paid}));
vi.mock('../../../scripts/pilot-hosted-linked',()=>({runHostedLinkedJourney:hooks.journey}));
import {prepareHostedGeneratedFiles,verifyHostedGeneratedFiles} from '../../../scripts/pilot-hosted-generated-files';
import {readEvidence} from '../../../scripts/pilot-evidence';
import {hostedConfigurationSchema} from '../../../lib/server/operations/hosted-configuration';
import {pilotHostedScopeSchema} from '../../../lib/contracts/pilot-hosted';
const roots:string[]=[];beforeEach(()=>{vi.clearAllMocks();hooks.restart.mockResolvedValue(Date.now());hooks.paid.mockResolvedValue([]);});afterEach(async()=>{vi.unstubAllGlobals();for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
 const root=await realpath(await mkdtemp(join(tmpdir(),'turas-generated-unit-'))),out=await realpath(await mkdtemp(join(tmpdir(),'turas-generated-unit-')));roots.push(root,out);
 const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex'),scope=pilotHostedScopeSchema.parse({contract:'pilot-hosted-scope-v1',runId:randomUUID(),projectId:'prj_unit',teamId:'team_unit',deploymentId:'dpl_original',origin:'https://example.com',environmentMarker:'unit-generated',workspaceId:randomUUID(),target:'production',sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)});
 const configuration=hostedConfigurationSchema.parse({contract:'pilot-hosted-configuration-v1',environmentMarker:scope.environmentMarker,projectId:scope.projectId,teamId:scope.teamId,storeId:'unit-store',objectBackend:'blob',executor:'sandbox',dispatcherEnabled:true,images:{scanner:'vcr.vercel.com/unit/scanner@sha256:'+'d'.repeat(64),parser:'vcr.vercel.com/unit/parser@sha256:'+'e'.repeat(64),renderer:'vcr.vercel.com/unit/renderer@sha256:'+'f'.repeat(64)},maximumConcurrentJobs:2,maximumDeadlineMs:300000,maximumInputBytes:10485760,maximumOutputBytes:52428800,maximumSandboxDispatches:20,costBudgetId:randomUUID(),costScopeDigest:'1'.repeat(64),costPricingDigest:'2'.repeat(64),embeddingProviderConfigured:false,blobSdkRetries:0});
 const reference={customerId:randomUUID(),source:{versionId:randomUUID(),extractionRunId:randomUUID(),lifecycleGeneration:1,profileRevisionId:randomUUID(),providerCalls:2},workforce:{importId:randomUUID(),sourceVersionId:randomUUID(),jobId:randomUUID(),providerCalls:2},knowledge:{contributionId:randomUUID(),publicationId:randomUUID()},plan:{planId:randomUUID(),revisionId:randomUUID(),engagementId:randomUUID(),baselineId:randomUUID()},reports:{providerCalls:2},artifactIds:Array.from({length:4},()=>randomUUID()),citationId:randomUUID()};
 const ids=[{revisionId:randomUUID(),reportId:randomUUID(),jobId:randomUUID()},{revisionId:randomUUID(),reportId:randomUUID(),jobId:randomUUID()}],contents=new Map<string,Buffer>();
 const rows=reference.artifactIds.map((id,index)=>{const pair=ids[Math.floor(index/2)],format=index%2?'pptx':'pdf',bytes=Buffer.from(format==='pdf'?'%PDF-unit-only':'PK-unit-only');contents.set(id,bytes);return {id,revision_id:pair.revisionId,report_id:pair.reportId,job_id:pair.jobId,format,size_bytes:String(bytes.length),content_digest:hash(bytes),created_at:new Date(Date.now()-60000),checks:{slides:40,pages:12}};}).sort((a,b)=>a.id.localeCompare(b.id));
 const query=vi.fn(async(sql:string)=>({rows:sql.includes('SELECT synthetic')?[{synthetic:true}]:rows})),db={query} as unknown as Client;
 const fetcher=vi.fn(async(input:URL|string)=>{const path=new URL(input).pathname;let data:unknown;
  if(path.endsWith('/api/artifacts/'+reference.source.versionId))data={id:reference.source.versionId,state:'ready',lifecycleGeneration:1,publishedRunId:reference.source.extractionRunId};
  else if(path.endsWith('/api/plans/'+reference.plan.planId))data={planId:reference.plan.planId,acceptedRevisionId:reference.plan.revisionId,engagementId:reference.plan.engagementId,reviewState:'accepted',contentAvailability:'readable'};
  else if(path.includes('/api/knowledge/'))data={id:reference.knowledge.publicationId};
  else if(path.includes('/api/staffing/imports/'))data={sourceVersionId:reference.workforce.sourceVersionId,withheld:false,extraction:{complete:true}};
  else{const bytes=contents.get(path.split('/').at(-1)!);return new Response(bytes?new Uint8Array(bytes):null,{status:bytes?200:404,headers:{'x-turas-code-version':scope.sourceCommit}});}
  return Response.json({data},{headers:{'x-turas-code-version':scope.sourceCommit}});
 });vi.stubGlobal('fetch',fetcher);hooks.journey.mockResolvedValue(reference);
 const context={scope,db,headers:new Headers(),configuration,evidenceDirectory:root,signal:AbortSignal.timeout(10000),customerId:reference.customerId,ownerMembershipId:randomUUID(),authorizationDigest:'3'.repeat(64),authorizationExpiresAt:new Date(Date.now()+60000).toISOString()};
 const resume={...context,scope:{...scope,deploymentId:'dpl_restarted'},evidenceDirectory:out,originalEvidenceDirectory:root};return {root,out,reference,rows,contents,context,resume,fetcher};
}
it('retains original normal journey identities and verifies every generated byte after restart without rerendering',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context);expect(hooks.journey).toHaveBeenCalledOnce();expect(await verifyHostedGeneratedFiles({...f.resume,manifest})).toEqual(f.reference);expect(hooks.journey).toHaveBeenCalledOnce();expect(hooks.restart).toHaveBeenCalledWith(expect.objectContaining({scope:f.resume.scope}),manifest.scope,manifest.preparedAt);
 expect(await readEvidence(f.out,'generated-retention.json')).toMatchObject({newProviderJobs:0,maximumGeneratedByteBoundaryVerified:false,fullHostedFileCatalogVerified:false,uncachedFullBytesAfterRestartVerified:true});
});
it('rejects changed original journey proof bytes before using a restart manifest',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context);await writeFile(join(f.root,'linked-execution.json'),'{}\n',{mode:0o600});await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow('integrity');expect(hooks.restart).not.toHaveBeenCalled();
});
it('rejects changed artifact rows and a changed private-store configuration',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context);f.rows[0].size_bytes=String(Number(f.rows[0].size_bytes)+1);await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow('original generated rows');
 await expect(verifyHostedGeneratedFiles({...f.resume,manifest,configuration:{...f.resume.configuration,storeId:'another-store'}})).rejects.toThrow('configuration changed');
});
it('rejects changed streamed bytes and serving code instead of accepting a successful HTTP status',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context);f.contents.set(f.reference.artifactIds[0],Buffer.from('%PDF-changed'));await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow('bytes differ');
 const transport=f.fetcher.getMockImplementation()!;f.fetcher.mockImplementation(async input=>{const response=await transport(input);response.headers.set('x-turas-code-version','0'.repeat(40));return response;});await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow();
});
it('rejects duplicate original identities and absent canonical paid worker receipts',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context);hooks.paid.mockRejectedValueOnce(Error('Original worker receipt absent'));await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow('Original worker');
 const reference={...manifest.reference,artifactIds:Array(4).fill(manifest.reference.artifactIds[0])};hooks.journey.mockResolvedValue(reference);await expect(prepareHostedGeneratedFiles({...f.context,evidenceDirectory:f.out})).rejects.toThrow('artifact pairs');
});
it('rejects normal source withdrawal and rows created after the original preparation',async()=>{
 const f=await fixture(),manifest=await prepareHostedGeneratedFiles(f.context),transport=f.fetcher.getMockImplementation()!;f.fetcher.mockImplementation(async input=>new URL(input).pathname==='/api/artifacts/'+f.reference.source.versionId?Response.json({data:{id:f.reference.source.versionId,state:'withdrawn'}},{headers:{'x-turas-code-version':f.context.scope.sourceCommit}}):transport(input));await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow();
 f.fetcher.mockImplementation(transport);f.rows[0].created_at=new Date(Date.now()+1000);await expect(verifyHostedGeneratedFiles({...f.resume,manifest})).rejects.toThrow('original generated rows');
});
