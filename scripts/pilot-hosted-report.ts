import {runSyntheticReportRecipe} from './pilot-report-recipe';
import {assertHostedPaidAdmission,verifyHostedPaidJobs} from './pilot-hosted-paid';
import type {HostedConfiguration} from '../lib/server/operations/hosted-configuration';
export async function runHostedReportJourney(input:Parameters<typeof runSyntheticReportRecipe>[0]&{configuration:HostedConfiguration;authorizationDigest:string;authorizationExpiresAt:string;authorization?:unknown}){
 await assertHostedPaidAdmission({...input,requiredJobs:2});
 const revisions:string[]=[];
 const result=await runSyntheticReportRecipe({...input,runQueuedRender:async id=>{revisions.push(id);await input.runQueuedRender(id);}});
 const domainJobIds=(await input.db.query("SELECT id FROM report_jobs WHERE environment_id=$1 AND revision_id=ANY($2::uuid[]) AND kind='render'",[input.scope.environmentMarker,revisions])).rows.map(row=>String(row.id));
 if(domainJobIds.length!==2)throw Error('Exact normally queued hosted render jobs required');
 const digest=input.configuration.images.renderer.split('@sha256:')[1];
 const jobs=await verifyHostedPaidJobs({...input,domainKind:'report',domainJobIds,expectedImageDigests:[digest,digest]});
 return {...result,contract:'pilot-hosted-linked-reports-v1',hostedProof:true,actualProviderJobs:jobs,providerCalls:jobs.length};
}
