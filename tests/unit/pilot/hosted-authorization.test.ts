import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {verifyHostedInfrastructureAuthorization} from '../../../scripts/pilot-hosted-authorization';
import {createHash} from 'node:crypto';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import type {PilotHostedScope} from '../../../lib/contracts/pilot-hosted';
const now=Date.parse('2026-10-19T00:00:00Z');
const scope={target:'production',projectId:'prj_synthetic',teamId:'team_synthetic',environmentMarker:'test-pilot-synthetic',sourceCommit:'a'.repeat(40),sourceDigest:'b'.repeat(64),catalogDigest:'c'.repeat(64)} as PilotHostedScope;
function authority(){return {contract:'pilot-infrastructure-user-authorization-v2',id:randomUUID(),userInstructionReference:'Synthetic explicit operator instruction',approvedAt:new Date(now-1000).toISOString(),expiresAt:new Date(now-1000+172800000).toISOString(),planDigest:'d'.repeat(64),projectId:scope.projectId,teamId:scope.teamId,environmentMarker:scope.environmentMarker,target:'production',sourceCommit:scope.sourceCommit,sourceDigest:scope.sourceDigest,catalogDigest:scope.catalogDigest,capMicroUsd:10000000,partitionsMicroUsd:{sandbox:3000000,blobAndTransfer:2000000,functionsAndWorkflow:3000000,builds:2000000},maximumSandboxJobs:32,maximumConcurrentJobs:2,maximumJobDeadlineMs:300000,maximumDeployments:2,maximumPrivateStores:1,automaticTopUp:false,automaticBillingChanges:false,productionChangesAuthorized:true,additionalModelAllowanceAuthorized:false};}
function legacy(){const {sourceCommit,sourceDigest,catalogDigest,userInstructionReference,maximumDeployments,...rest}=authority();return {...rest,contract:'pilot-preview-infrastructure-user-authorization-v1',target:'preview',productionChangesAuthorized:false,maximumPreviewDeployments:2};}
it('preserves the original Preview authorization bytes and bounds',()=>{
 const raw=legacy(),result=verifyHostedInfrastructureAuthorization(raw,{...scope,target:'preview'},now);
 expect(result.authorizationDigest).toBe(createHash('sha256').update(JSON.stringify(raw)).digest('hex'));expect(result.authorizationDigest).not.toBe(recoveryDigest(raw));expect(result.maximumDeployments).toBe(2);expect(result.maximumSandboxJobs).toBe(32);
});
it('binds separate Production authority to the exact source and target',()=>{
 const raw=authority(),result=verifyHostedInfrastructureAuthorization(raw,scope,now);
 expect(result.authorizationDigest).toBe(createHash('sha256').update(JSON.stringify(raw)).digest('hex'));expect(result.target).toBe('production');
});
it('rejects changed project environment target or source identities',()=>{
 for(const patch of [{projectId:'prj_other'},{teamId:'team_other'},{environmentMarker:'other'},{target:'preview' as const},{sourceCommit:'f'.repeat(40)},{sourceDigest:'f'.repeat(64)},{catalogDigest:'f'.repeat(64)}])expect(()=>verifyHostedInfrastructureAuthorization(authority(),{...scope,...patch},now)).toThrow();
});
it('rejects widened jobs deadlines billing or unpartitioned caps',()=>{
 for(const patch of [{maximumSandboxJobs:33},{maximumConcurrentJobs:3},{maximumJobDeadlineMs:300001},{maximumDeployments:3},{capMicroUsd:10000001},{automaticTopUp:true},{automaticBillingChanges:true},{additionalModelAllowanceAuthorized:true},{productionChangesAuthorized:false},{unreviewedScope:true}])expect(()=>verifyHostedInfrastructureAuthorization({...authority(),...patch},scope,now)).toThrow();
});
it('rejects expired future or extended authorization windows',()=>{
 for(const [approvedAt,expiresAt] of [[now-172800000,now],[now+1,now+172800001],[now-1000,now+172800000]])expect(()=>verifyHostedInfrastructureAuthorization({...authority(),approvedAt:new Date(approvedAt).toISOString(),expiresAt:new Date(expiresAt).toISOString()},scope,now)).toThrow();
});
it('cannot promote legacy Preview authority into Production',()=>{
 expect(()=>verifyHostedInfrastructureAuthorization(legacy(),scope,now)).toThrow();
 expect(()=>verifyHostedInfrastructureAuthorization({...legacy(),target:'production',productionChangesAuthorized:true},scope,now)).toThrow();
});
