import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {requireOwnedLearningDatabase} from '../../../scripts/learning-environment';
import {learningScopedFixture,learningAcceptedOriginal} from './setup';
import {prepareLearningDraft,learningDraftMeta} from '../../../lib/server/learning/advisory';
export function installLearningSyntheticPrice(){
 requireOwnedLearningDatabase(process.env);
 process.env.TURAS_014_PRICE_CONTRACT=JSON.stringify({version:'learning-price-v1',modelId:'spacexai/grok-4.7',inputMicroUsdPerMillion:'8000000',outputMicroUsdPerMillion:'24000000',providerInputLimit:500000,providerOutputLimit:500000,hardOutputCapIncludesReasoning:true,pricingSource:'https://ai-gateway.vercel.sh/v1/models',outputContractSource:'https://vercel.com/ai-gateway/models/grok-4.7',pricingCaptureDigest:'a'.repeat(64),outputContractCaptureDigest:'b'.repeat(64),verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
}
export async function learningPreparedNativeDraft(db:PoolClient,mode:'normal'|'malformed'|'unknown'|'overrun'|'forbidden'|'all_reads'='normal'){
 requireOwnedLearningDatabase(process.env,true);const scope=await learningScopedFixture(db),actor=scope.actors.member,lineage=await learningAcceptedOriginal(db,actor,scope.actors.admin,scope.customerId);
 await db.query('UPDATE learning_workspace_state SET enabled=true WHERE workspace_id=$1',[scope.workspaceId]);
 await db.query('INSERT INTO learning_native_fixture_modes(customer_id,mode) VALUES($1,$2)',[scope.customerId,mode]);
 const prepared=await prepareLearningDraft(actor,{contractVersion:'learning-v1',requestId:randomUUID(),expectedVersion:0,customerId:scope.customerId,lineage:[lineage],feedbackIds:[],question:`PRIVATE014_${scope.customerId}`,budgetUsd:'25'});
 if(!prepared.targetId)throw Error('Native learning draft identity required');if(mode==='normal')await db.query('INSERT INTO learning_native_fixture_retirement_hold(attempt_id) VALUES($1)',[prepared.targetId]);return {...scope,actor,lineage,meta:await learningDraftMeta(actor,prepared.targetId)};
}
