import {z} from 'zod';
import {pilotCommit,pilotDigest,pilotHostedIdentity} from './pilot-readiness';
export const pilotHostedScopeSchema=z.strictObject({
 contract:z.literal('pilot-hosted-scope-v1'),runId:z.uuid(),
 projectId:z.string().regex(/^prj_[A-Za-z0-9]+$/),teamId:z.string().regex(/^team_[A-Za-z0-9]+$/),
 deploymentId:z.string().regex(/^dpl_[A-Za-z0-9]+$/),origin:pilotHostedIdentity.shape.origin,
 environmentMarker:pilotHostedIdentity.shape.environmentMarker,workspaceId:z.uuid(),
 target:z.enum(['preview','production']),sourceCommit:pilotCommit,sourceDigest:pilotDigest,catalogDigest:pilotDigest,
});
export type PilotHostedScope=z.infer<typeof pilotHostedScopeSchema>;
const deploymentSchema=z.object({id:z.string(),projectId:z.string(),ownerId:z.string(),readyState:z.string(),target:z.string().nullable().optional(),
 meta:z.record(z.string(),z.string()).optional(),gitSource:z.object({sha:z.string().optional()}).optional()});
/** Only metadata returned by the authenticated platform transport is used by the
 * runner. A proposed scope is not evidence of ownership or deployed identity. */
export function verifyHostedDeployment(raw:unknown,scope:Pick<PilotHostedScope,'deploymentId'|'projectId'|'teamId'|'sourceCommit'|'target'>){
 const deployment=deploymentSchema.parse(raw);
 const commits=[deployment.meta?.githubCommitSha,deployment.gitSource?.sha].filter(value=>value!==undefined);
 const commit=commits[0];
 if(deployment.id!==scope.deploymentId||deployment.projectId!==scope.projectId||deployment.ownerId!==scope.teamId||deployment.readyState!=='READY'||!commits.length||commits.some(value=>value!==scope.sourceCommit)||
   (scope.target==='production'?deployment.target!=='production':deployment.target!=null))throw Error('Hosted deployment identity or target differs');
 return {deploymentId:deployment.id,projectId:deployment.projectId,teamId:deployment.ownerId,commit};
}
