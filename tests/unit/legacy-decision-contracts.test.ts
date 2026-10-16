import {beforeEach,afterEach,vi} from 'vitest';
beforeEach(()=>vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-receipt-contract-secret'));
afterEach(()=>vi.unstubAllEnvs());
import {expect,it} from 'vitest';
import {composeDecision,judgmentsSchema,judgmentKeys,decisionState,decisionFailureDiagnostic,type Judgments} from '../../lib/server/research/specialists/solution-research/decision-workflow';
import {calculateProcessImpact,processImpactSchema,type ProcessImpact} from '../../lib/server/research/specialists/solution-research/process-impact';
import {signResearch} from '../../lib/server/research/specialists/solution-research/receipt';
import {context,brief,sources} from '../fixtures/legacy-solution-research';
const judgments=()=>judgmentsSchema.parse(Object.fromEntries(judgmentKeys.map(key=>[key,{choice:'supported',probabilities:{supported:.96,unknown:.03,blocked:.01}}])));
it('retains original advisory routing, uncertainty precedence and strict distributions without action authority',()=>{
 expect(composeDecision(judgments(),[])).toMatchObject({action:'bounded_pilot',reviewRequired:false});
 for(const key of ['technology','process','security','ownership','adoption'] as const){const j=judgments();j[key]={choice:'blocked',probabilities:{supported:.01,unknown:.03,blocked:.96}};expect(composeDecision(j,[]).action).toBe('rework');}
 for(const key of ['economics','capacity'] as const){const j=judgments();j[key]={choice:'blocked',probabilities:{supported:.01,unknown:.03,blocked:.96}};expect(composeDecision(j,[]).action).toBe('defer');}
 expect(composeDecision(judgments(),['stale']).action).toBe('research_more');
 const uncertain=judgments();uncertain.security={choice:'supported',probabilities:{supported:.6,unknown:.3,blocked:.1}};
 expect(composeDecision(uncertain,[])).toMatchObject({action:'research_more',reviewRequired:true,uncertain:['security']});
 uncertain.security={choice:'unknown',probabilities:{supported:.01,unknown:.98,blocked:.01}};expect(composeDecision(uncertain,[]).action).toBe('research_more');
 const invalid=judgments();invalid.security.probabilities.supported=.1;expect(judgmentsSchema.safeParse(invalid).success).toBe(false);
 const missing:Partial<Judgments>=judgments();delete missing.security;expect(judgmentsSchema.safeParse(missing).success).toBe(false);
 const inconsistent=judgments();inconsistent.security.choice='blocked';expect(judgmentsSchema.safeParse(inconsistent).success).toBe(false);
 expect(composeDecision(judgments(),[])).not.toHaveProperty('approved');
});
it('derives freshness in code and omits researcher recommendation and provider details from decision state/diagnostics',()=>{
 const c=structuredClone(context);c.evidence[0].reviewAfter='2026-09-01';
 const receipt=signResearch({userId:'synthetic',workspaceId:'synthetic',environmentId:'test',issuedAt:new Date().toISOString(),context:c,brief,sources,blockers:['stale']});
 const state=decisionState(receipt,new Date('2026-09-20'));
 expect(state.customer.evidence[0].dueForReview).toBe(true);expect(state).not.toHaveProperty('recommendation');expect(state).not.toHaveProperty('sources');expect(state.deterministicBlockers).toEqual(['stale']);
 expect(decisionFailureDiagnostic(new Error('Authentication failed with API key fixture-secret'))).toEqual({category:'provider_authentication'});
 expect(decisionFailureDiagnostic(new Error('Decision state exceeds the input budget.'))).toEqual({category:'input_budget'});
 expect(decisionFailureDiagnostic(new Error('private arbitrary payload'))).toEqual({category:'unknown'});
});
const impact=()=>processImpactSchema.parse({process:'Review routing',currentWorkflow:'Manual review',proposedChange:'Protected previews',affectedRoles:'Reviewers',timeBasis:'active_work',inputs:Object.entries({monthlyVolume:120,baselineMinutes:30,proposedMinutes:15,adoptionFraction:.6}).map(([name,value])=>({name,value,basis:'assumption',explanation:'Explicit hypothetical input',customerEvidenceIds:[],sourceIds:[]})),realization:'Adoption required',costsAndRisks:'Training and operating costs unknown',validationPlan:'Measure active task time after30days'});
it('distinguishes active effort, elapsed cycles, negative capacity and invalid adoption inputs',()=>{
 const value=impact();expect(calculateProcessImpact(value)).toMatchObject({estimatedMonthlyHoursReleased:18,estimatedMonthlyCapacityValue:null,estimatedMonthlyNetCashSavings:null,cashPaybackMonths:null});
 expect(calculateProcessImpact({...value,timeBasis:'elapsed_cycle'}).estimatedMonthlyHoursReleased).toBeNull();
 value.inputs.find(i=>i.name==='proposedMinutes')!.value=45;expect(calculateProcessImpact(value).estimatedMonthlyHoursReleased).toBe(-18);
 value.inputs.find(i=>i.name==='adoptionFraction')!.value=60;expect(processImpactSchema.safeParse(value).success).toBe(false);
});
it('keeps released-capacity value separate from evidenced net cash, positive payback and unknown recurring cost',()=>{
 const value=impact();for(const [name,amount]of Object.entries({loadedHourlyCost:80,implementationCost:1200,recurringMonthlyCost:200,cashAvoidedMonthly:500}))value.inputs.push({name:name as ProcessImpact['inputs'][number]['name'],value:amount,basis:'assumption',explanation:'Explicit same-currency assumption',customerEvidenceIds:[],sourceIds:[]});
 expect(calculateProcessImpact(processImpactSchema.parse(value))).toMatchObject({estimatedMonthlyCapacityValue:1440,estimatedMonthlyNetCashSavings:300,cashPaybackMonths:4});
 value.inputs.find(i=>i.name==='cashAvoidedMonthly')!.value=0;expect(calculateProcessImpact(value)).toMatchObject({estimatedMonthlyCapacityValue:1440,estimatedMonthlyNetCashSavings:-200,cashPaybackMonths:null});
 value.inputs=value.inputs.filter(i=>i.name!=='recurringMonthlyCost');expect(calculateProcessImpact(value)).toMatchObject({estimatedMonthlyNetCashSavings:null,cashPaybackMonths:null});
});
