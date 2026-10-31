import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {Client} from 'pg';
import type {PilotHostedScope} from '../lib/contracts/pilot-hosted';
import {citationLocatorSchema} from '../lib/contracts/retrieval';
import {planCreateSchema,planSubmitSchema,planDecisionSchema} from '../lib/contracts/plans';
import {syntheticHostedPlanContent} from './pilot-hosted-plan';
import {PilotHostedResponseError} from './pilot-hosted-request';
import type {HostedJourneyRequest} from './pilot-hosted-baseline';

/** Freeze an ordinary exact preview before the linked original is withdrawn.
 * A separate plan leaves the accepted delivery baseline unchanged. */
export async function prepareHostedPlanSourceBoundary(input:{scope:PilotHostedScope;customerId:string;workloadId:string;ownerMembershipId:string;citationId:string;sourceRevisionId:string;request:HostedJourneyRequest;signal:AbortSignal}){
 const {scope,request,signal}=input,unwrap=(raw:unknown)=>z.object({data:z.unknown()}).parse(raw).data;
 signal.throwIfAborted();
 const source=z.object({citationId:z.uuid(),sourceKind:z.literal('accepted_profile'),sourceRevisionId:z.uuid(),sourceGeneration:z.number().int().positive(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),text:z.string().min(1).max(2000),locators:z.array(citationLocatorSchema).min(1),validUntil:z.iso.datetime({offset:true})}).parse(unwrap(await request('/api/retrieval/citations/'+input.citationId,'GET')));
 if(source.citationId!==input.citationId||source.sourceRevisionId!==input.sourceRevisionId||Date.parse(source.validUntil)<=Date.now())throw Error('Exact current plan-boundary source required');
 const identity=z.object({planId:z.uuid(),revisionId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/),aggregateVersion:z.number().int().positive()});
 const created=identity.parse(unwrap(await request('/api/plans','POST',planCreateSchema.parse({requestKey:randomUUID(),workspaceId:scope.workspaceId,customerId:input.customerId,workloadId:input.workloadId,ownerMembershipId:input.ownerMembershipId,audience:'delivery',content:syntheticHostedPlanContent(source)}))));
 const submitted=identity.parse(unwrap(await request('/api/plans/'+created.planId+'/submit','POST',planSubmitSchema.parse({requestKey:randomUUID(),expectedAggregateVersion:created.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest}))));
 const preview=identity.extend({previewId:z.uuid(),expiresAt:z.iso.datetime({offset:true}),readiness:z.object({ready:z.literal(true)})}).parse(unwrap(await request('/api/plans/'+created.planId+'/review-preview','POST',{requestKey:randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,revisionId:submitted.revisionId,contentDigest:submitted.contentDigest})));
 if(submitted.planId!==created.planId||submitted.revisionId!==created.revisionId||submitted.contentDigest!==created.contentDigest||preview.planId!==created.planId||preview.revisionId!==created.revisionId||preview.contentDigest!==created.contentDigest||preview.aggregateVersion!==submitted.aggregateVersion)throw Error('Exact plan-boundary preview differs');
 return {contract:'pilot-hosted-plan-source-boundary-intent-v1' as const,planId:created.planId,customerId:input.customerId,sourceRevisionId:source.sourceRevisionId,preparedAt:new Date().toISOString(),previewExpiresAt:preview.expiresAt,decision:planDecisionSchema.parse({requestKey:randomUUID(),action:'accept',revisionId:created.revisionId,contentDigest:created.contentDigest,expectedAggregateVersion:submitted.aggregateVersion,reviewPreviewId:preview.previewId,rationale:'Controlled boundary: original exact preview must fail after its source is withdrawn',deliverySuitabilityConfirmed:true})};
}
export async function verifyHostedPlanSourceBoundary(input:{intent:Awaited<ReturnType<typeof prepareHostedPlanSourceBoundary>>;scope:PilotHostedScope;db:Client;request:HostedJourneyRequest;signal:AbortSignal}){
 const {intent,scope,db,request,signal}=input;signal.throwIfAborted();if(Date.parse(intent.previewExpiresAt)<=Date.now())throw Error('Original plan-boundary preview expired');let denial:string|undefined;
 try{await request('/api/plans/'+intent.planId+'/decisions','POST',intent.decision);}catch(error){if(error instanceof PilotHostedResponseError&&error.releaseMatches&&error.status===409&&['plan_source_changed','plan_citation_changed','stale_review'].includes(error.errorCode??''))denial=error.errorCode!;else throw error;}
 if(Date.parse(intent.previewExpiresAt)<=Date.now())throw Error('Original plan-boundary preview expired during verification');
 if(!denial)throw Error('Changed-source exact plan acceptance was not denied');
 const state=(await db.query('SELECT accepted_revision_id,engagement_id,aggregate_version FROM delivery_plans WHERE id=$1 AND workspace_id=$2 AND customer_id=$3',[intent.planId,scope.workspaceId,intent.customerId])).rows;
 if(state.length!==1||state[0].accepted_revision_id!==null||state[0].engagement_id!==null||Number(state[0].aggregate_version)!==intent.decision.expectedAggregateVersion)throw Error('Denied plan acceptance changed accepted state');
 return {contract:'pilot-hosted-plan-source-boundary-v1',planId:intent.planId,revisionId:intent.decision.revisionId,requestKey:intent.decision.requestKey,sourceRevisionId:intent.sourceRevisionId,preparedAt:intent.preparedAt,completedAt:new Date().toISOString(),denialCode:denial,sourceChangeAcceptanceDenied:true,acceptedStateUnchanged:true,normalPreparationCommands:3,deniedAcceptanceCommands:1,providerCalls:0};
}
