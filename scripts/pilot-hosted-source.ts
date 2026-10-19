import {runSyntheticSourceRecipe} from './pilot-source-recipe';
import {assertHostedPaidAdmission,verifyHostedPaidJobs} from './pilot-hosted-paid';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
export async function runHostedSourceJourney(input:Parameters<typeof runSyntheticSourceRecipe>[0]&{configuration:HostedConfiguration;authorizationDigest:string;authorizationExpiresAt:string;authorization?:unknown}){
 await assertHostedPaidAdmission({...input,requiredJobs:2});
 const result=await runSyntheticSourceRecipe(input);
 const jobs=await verifyHostedPaidJobs({...input,domainKind:'artifact',domainJobIds:[result.extractionRunId],expectedImageDigests:[input.configuration.images.scanner,input.configuration.images.parser].map(image=>image.split('@sha256:')[1])});
 return {...result,contract:'pilot-hosted-linked-source-v1',hostedProof:true,actualProviderJobs:jobs,providerCalls:jobs.length};
}
