import {describe,it,expect} from 'vitest';
import {EXPANSION_ADVICE_LIMITS,expansionAdviceRequestSchema,expansionSummaryToolSchema,expansionHypothesesToolSchema,expansionEvidenceToolSchema,expansionSkillToolSchema,validateExpansionAdviceResult,expansionContextCharge} from '../../lib/expansion/advice';
import {discoveryHypothesis} from '../fixtures/expansion';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const zero={contractVersion:'expansion-advice-v1',summary:'Selected evidence does not yet establish a customer need.',facts:[],unknowns:[{text:'Customer need',reason:'No accepted private observation selected'}],discoverySteps:[{action:'Ask the operating owner',validationCriterion:'Record a reviewed need'}],proposals:[]};
describe('Bounded expansion advice contracts',()=>{
 it('encodes the six-step/read and cumulative byte limits with zero-proposal output',()=>{
  expect(EXPANSION_ADVICE_LIMITS).toMatchObject({steps:6,reads:6,outputTokens:4096,contextBytes:24576,dependencies:200,hourlyAdmissions:5,deadlineMs:120000,requestExpiryMs:300000});expect(validateExpansionAdviceResult(zero,[],[]).proposals).toEqual([]);
  expect(expansionContextCharge('x'.repeat(24574))).toBe(24576);expect(()=>expansionContextCharge('é'.repeat(12288))).toThrow();
 });
 it('requires explicit inputs and rejects attachments, authority fields, duplicate or excessive hypotheses',()=>{
  const request={contractVersion:'expansion-v1',expectedVersion:0,requestKey:id,workloadId:null,question:'Investigate the selected operating need',selectedEngagementIds:[],sourceRefs:[],selectedHypothesisIds:[]};expect(expansionAdviceRequestSchema.safeParse(request).success).toBe(true);
  for(const patch of [{question:''},{question:'x'.repeat(2001)},{attachments:[]},{conversationId:other},{audience:'delivery'},{ownerMembershipId:other},{selectedHypothesisIds:[id,id]},{selectedHypothesisIds:Array.from({length:21},(_,index)=>`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`)}])expect(expansionAdviceRequestSchema.safeParse({...request,...patch}).success).toBe(false);
 });
 it('enforces exact three read schemas plus the single skill and no generic scope overrides',()=>{
  expect(expansionSummaryToolSchema.safeParse({}).success).toBe(true);expect(expansionSummaryToolSchema.safeParse({customerId:other}).success).toBe(false);
  expect(expansionHypothesesToolSchema.safeParse({limit:20,disposition:'dismissed'}).success).toBe(true);for(const input of [{limit:21},{cursor:'x'.repeat(4097)},{customerId:other}])expect(expansionHypothesesToolSchema.safeParse(input).success).toBe(false);
  expect(expansionEvidenceToolSchema.safeParse({sourceKeys:[id]}).success).toBe(true);expect(expansionEvidenceToolSchema.safeParse({sourceKeys:[id,id]}).success).toBe(false);expect(expansionEvidenceToolSchema.safeParse({sourceKeys:Array(11).fill(id)}).success).toBe(false);
  expect(expansionSkillToolSchema.safeParse({name:'product-expansion'}).success).toBe(true);expect(expansionSkillToolSchema.safeParse({name:'tam-support-guidance'}).success).toBe(false);
 });
 it('keeps facts attributed and rejects unselected citation, hypothesis and qualification fields',()=>{
  const publicFact={classification:'attributed_observation',statement:'A selected public source reports this observation.',citationKeys:[id]};
  expect(validateExpansionAdviceResult({...zero,facts:[publicFact]},[{id,kind:'verified_research'}],[]).facts).toHaveLength(1);
  for(const result of [{...zero,facts:[{...publicFact,classification:'accepted_fact'}]},{...zero,facts:[{...publicFact,citationKeys:[other]}]},{...zero,qualification:'qualified'},{...zero,proposals:[{content:discoveryHypothesis(),citationKeys:[],relatedHypothesisIds:[other]}]}])expect(()=>validateExpansionAdviceResult(result,[{id,kind:'verified_research'}],[])).toThrow();
 });
 it('accepts at most five strictly proposed hypotheses and rejects undeclared source mapping',()=>{
  const proposal={content:discoveryHypothesis(),citationKeys:[],relatedHypothesisIds:[]};expect(validateExpansionAdviceResult({...zero,proposals:Array(5).fill(proposal)},[],[]).proposals).toHaveLength(5);expect(()=>validateExpansionAdviceResult({...zero,proposals:Array(6).fill(proposal)},[],[])).toThrow();
  expect(()=>validateExpansionAdviceResult({...zero,proposals:[{...proposal,content:{...proposal.content,disposition:'qualified'}}]},[],[])).toThrow();
  expect(()=>validateExpansionAdviceResult({...zero,proposals:[{...proposal,content:{...proposal.content,currentUse:{kind:'evidenced',state:'actual',sourceKeys:[id]}}}]},[{id,kind:'accepted_profile'}],[])).toThrow();
 });
 it('withholds ownerless prerequisite validation while preserving an explicit unknown-owner discovery proposal',()=>{
  const content=discoveryHypothesis();
  const prerequisite={id:'validate-runtime',status:'validation_needed',rationale:'Confirm candidate runtime eligibility',sourceKeys:[],unknownReason:'No accepted eligibility or operating owner selected',validationStep:'Ask the operating owner to review runtime requirements'};
  const proposal={content:{...content,prerequisites:[prerequisite]},citationKeys:[],relatedHypothesisIds:[]};
  expect(()=>validateExpansionAdviceResult({...zero,proposals:[proposal]},[],[])).toThrow();
  const unknown={text:'Candidate runtime eligibility and validation owner',reason:'No accepted eligibility or operating owner selected'};
  const discovery={...proposal,content:{...content,prerequisites:[],unknowns:[unknown]}};
  const result=validateExpansionAdviceResult({...zero,unknowns:[unknown],discoverySteps:[{action:prerequisite.validationStep,validationCriterion:'A human identifies the operating owner and records reviewed eligibility'}],proposals:[discovery]},[],[]);
  expect(result.proposals[0].content.unknowns).toEqual([unknown]);
  expect(result.proposals[0].content.prerequisites).toEqual([]);
 });
 it('validates review dates against the server UTC day without changing source age',()=>{
  const at=new Date('2026-10-08T23:59:59.999Z');
  const proposal={content:{...discoveryHypothesis(),nextReviewDate:'2026-10-08'},citationKeys:[],relatedHypothesisIds:[]};
  expect(validateExpansionAdviceResult({...zero,proposals:[proposal]},[],[],at).proposals).toHaveLength(1);
  for(const date of ['2026-10-07','2027-10-10','2026-02-30'])expect(()=>validateExpansionAdviceResult({...zero,proposals:[{...proposal,content:{...proposal.content,nextReviewDate:date}}]},[],[],at)).toThrow();
 });
 it('rejects malformed maps and preserves planning observations as attributed facts',()=>{
  const fact={classification:'attributed_observation',statement:'A selected baseline records a planned outcome.',citationKeys:[id]};
  expect(validateExpansionAdviceResult({...zero,facts:[fact]},[{id,kind:'milestone_baseline'}],[]).facts[0].classification).toBe('attributed_observation');
  for(const sources of [[{id,kind:'milestone_baseline'},{id,kind:'milestone_baseline'}],[{id,kind:'customer_claim'}]])expect(()=>validateExpansionAdviceResult({...zero,facts:[fact]},sources,[])).toThrow();
  expect(()=>validateExpansionAdviceResult({...zero,facts:[{...fact,classification:'accepted_fact'}]},[{id,kind:'milestone_baseline'}],[])).toThrow();
 });

});
