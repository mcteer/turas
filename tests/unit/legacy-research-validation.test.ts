import {describe,it,expect,vi,afterEach} from 'vitest';
import {context,brief,sources,identity} from '../fixtures/legacy-specialist-contracts';
import {researchGaps,researchBriefSchema,researchSubmissionSchema} from '../../lib/server/research/specialists/solution-research/schema';
import {gatedAction} from '../../lib/server/research/specialists/solution-research/decision';
import {signResearch,verifyResearch,researchReceiptSchema} from '../../lib/server/research/specialists/solution-research/receipt';
import {signCustomerUpdate,verifyCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update-receipt';
import {bindCustomerUpdate,customerUpdateRevisionReasons,type customerUpdateSubmissionSchema} from '../../lib/server/research/specialists/solution-research/customer-update';
import {researchPassages,publicationEvidence} from '../../lib/server/research/specialists/solution-research/source-integrity';
import type {z} from 'zod';
const now=new Date('2026-09-20T00:00:00.000Z');
afterEach(()=>vi.unstubAllEnvs());
describe('active solution assessment evidence gates',()=>{
 it('requires all seven unique dimensions, scoped support, all three alternatives and actual publisher floor',()=>{
  expect(researchGaps(researchBriefSchema.parse(brief),context,sources,now)).toEqual([]);
  const repeated=structuredClone(brief);repeated.findings[1].dimension=repeated.findings[0].dimension;expect(researchGaps(repeated,context,sources,now)).toContain('Every assessment dimension must appear exactly once.');
  const wrong=structuredClone(brief);wrong.accountId='22222222-2222-4222-8222-222222222222';wrong.alternatives=wrong.alternatives.map(a=>({...a,kind:'proposed'}));wrong.findings[0]={...wrong.findings[0],basis:'supported',customerEvidenceIds:[],sourceIds:[]};
  expect(researchGaps(wrong,context,sources.slice(0,1),now)).toEqual(expect.arrayContaining(['Customer account mismatch.','Compare the proposal, a credible alternative, and the status quo.','Missing support for technology_stack.','Customer-specific prerequisites are not evidenced in every core dimension.','Research requires at least three retrieved sources from two publishers; this is an evidence floor, not proof of quality.']));
 });
 it('rejects invented customer IDs, quotations, dates, alternative citations and measured results',()=>{
  const invalid=structuredClone(brief);invalid.findings[0].customerEvidenceIds=['invented'];invalid.findings[1].sourceIds=['invented'];invalid.sourceSupport[0].quote='Absent quotation';invalid.sourceSupport[0].publishedAt='2026-09-21';invalid.alternatives[1].sourceIds=['invented'];invalid.measures[0].basis='customer_observed';
  const gaps=researchGaps(invalid,context,sources,now);expect(gaps).toEqual(expect.arrayContaining(['Unknown customer evidence in technology_stack.','Unsupported citation in delivery_processes.','Unverified source quotation: source-test-0.','Unverified publication date: source-test-0.','Publication date is after retrieval: source-test-0.','Unsupported alternative citation.','An observed measure requires customer evidence.']));
  expect(gatedAction('bounded_pilot',gaps)).toBe('research_more');expect(gatedAction('rework',gaps)).toBe('rework');expect(gatedAction('bounded_pilot',[])).toBe('bounded_pilot');
 });
 it('withholds readiness for inaccessible, incomplete, stale, unknown or incompatible context and unresolved conflicts',()=>{
  for(const changed of [{...context,journalStatus:'denied' as const},{...context,moreAvailable:true},{...context,evidence:context.evidence.map(e=>({...e,reviewAfter:'2026-09-01'}))}])expect(gatedAction('bounded_pilot',researchGaps(brief,changed,sources,now))).toBe('research_more');
  for(const fit of ['unknown','incompatible'] as const){const changed=structuredClone(brief);changed.findings[0].fit=fit;expect(researchGaps(changed,context,sources,now)).toContain('Unknown or incompatible customer fit requires resolution.');}
  expect(researchGaps({...brief,conflicts:['Two current sources disagree']},context,sources,now)).toContain('Research contains unresolved gaps or conflicts.');
 });
 it('binds public process benchmarks and observed process inputs to exact retained support',()=>{
  const process={process:'Review routing',currentWorkflow:'Manual routing',proposedChange:'Protected previews',affectedRoles:'Reviewers',timeBasis:'active_work' as const,inputs:[{name:'baselineMinutes' as const,value:30,basis:'public_benchmark' as const,explanation:'A synthetic benchmark provenance test',customerEvidenceIds:[],sourceIds:[sources[0].id]}],realization:'Validate applicability with the customer',costsAndRisks:'Customer costs remain unknown',validationPlan:'Collect an actual customer baseline'};
  const valid={...brief,processImpact:[process]};expect(researchGaps(valid,context,sources,now).filter(g=>g.includes('process'))).toEqual([]);
  const forged=structuredClone(valid);forged.sourceSupport.push({...forged.sourceSupport[0],quote:'Absent from retained source'});expect(researchGaps(forged,context,sources,now)).toContain('Unverified process-impact input reference.');
  expect(researchGaps({...brief,processImpact:[{...process,inputs:[{...process.inputs[0],sourceIds:[]}]}]},context,sources,now)).toContain('Public process benchmarks require retrieved source support.');
  expect(researchGaps({...brief,processImpact:[{...process,inputs:[{...process.inputs[0],basis:'customer_observed',customerEvidenceIds:[]}]}]},context,sources,now)).toContain('Observed process-impact inputs require customer evidence.');
 });
});
const updateSources=[{id:'vercel',url:'https://vercel.com/customers/example',title:'Synthetic historical workload',retrievedAt:now.toISOString(),excerpt:'Published: 2026-03-12\nThe experimental workload was pre-alpha at publication.'},{id:'customer',url:'https://example.com/docs/product',title:'Synthetic customer documentation',retrievedAt:now.toISOString(),excerpt:'Last updated: 2026-09-19\nThe documented product is now in public beta, not the whole company.'}].map(s=>({...s,publication:publicationEvidence(s.excerpt)}));
function submission():z.infer<typeof customerUpdateSubmissionSchema>{return {accountId:context.accountId,question:'What is the current documented product state?',findings:updateSources.map((s,i)=>({claim:i?'The documentation describes public beta.':'The earlier story describes pre-alpha.',scope:'Named workload only',sourceId:s.id,passageId:researchPassages(s)[0].id,publisherType:i?'customer':'vercel'})),conflicts:[],unknowns:['Workload equivalence is not established.'],coverage:{release_history:{status:'checked',sourceIds:['customer'],currentIndexSourceId:'customer',note:'Synthetic current index binding fixture.'},current_documentation:{status:'checked',sourceIds:['customer'],note:'Synthetic current documentation fixture.'},availability_and_pricing:{status:'checked',sourceIds:['customer'],note:'Synthetic availability binding fixture.'},operations_and_limits:{status:'checked',sourceIds:['customer'],note:'Synthetic operating limit fixture.'},employee_testimony:{status:'not_applicable',sourceIds:[],searchIds:[],note:'Focused fixture, no broad discovery claim.'},practitioner_experience:{status:'not_applicable',sourceIds:[],searchIds:[],note:'Focused fixture, no broad discovery claim.'}}};}
describe('active recon coverage and signed research handoffs',()=>{
 it('preserves scope/publication, treats empty findings as gaps and rejects publisher or passage fabrication',()=>{
  const bound=bindCustomerUpdate(submission(),updateSources);expect(bound.blockers).toEqual([]);expect(bound.update.findings.map(f=>f.publishedAt)).toEqual(['2026-03-12',null]);expect(bound.update.findings.every(f=>f.scope==='Named workload only')).toBe(true);
  const invalid=submission();invalid.findings[0].publisherType='customer';invalid.findings[1].passageId='invented';const rejected=bindCustomerUpdate(invalid,updateSources);expect(rejected.update.findings).toEqual([]);expect(rejected.sources).toEqual([]);expect(rejected.blockers.some(b=>b.includes('Publisher classification'))).toBe(true);
  expect(bindCustomerUpdate({...submission(),findings:[]},[]).blockers).toContain('No current public findings could be substantiated.');
 });
 it('requires retained findings for coverage and current release index, preserving honest unavailable gaps',()=>{
  const missing=submission();delete missing.coverage;expect(bindCustomerUpdate(missing,updateSources).blockers).toContain('Current-state source coverage was not assessed; this is a partial lookup.');
  const input=submission();input.coverage!.release_history.sourceIds.push('unretained-release');let bound=bindCustomerUpdate(input,updateSources);expect(bound.update.coverage!.release_history.status).toBe('unavailable');expect(customerUpdateRevisionReasons(input,bound)).toHaveLength(1);expect(customerUpdateRevisionReasons(input,bound)[0]).toContain('unretained-release');
  input.coverage!.release_history.sourceIds=['customer'];expect(customerUpdateRevisionReasons(input,bindCustomerUpdate(input,updateSources))).toEqual([]);
  delete input.coverage!.release_history.currentIndexSourceId;bound=bindCustomerUpdate(input,updateSources);expect(bound.update.coverage!.release_history.status).toBe('unavailable');expect(customerUpdateRevisionReasons(input,bound).join(' ')).toContain('currentIndexSourceId');
  input.coverage!.release_history={status:'unavailable',sourceIds:[],note:'Current release index could not be retrieved.'};expect(customerUpdateRevisionReasons(input,bindCustomerUpdate(input,updateSources))).toEqual([]);
 });
 it('does not promote unrecorded discovery or wrong testimony types into checked coverage',()=>{
  const input=submission();input.coverage!.employee_testimony={status:'checked',sourceIds:['customer'],searchIds:['missing-search'],note:'A claimed discovery without a server receipt.'};let bound=bindCustomerUpdate(input,updateSources);expect(bound.update.coverage!.employee_testimony!.status).toBe('unavailable');
  const searches=[{searchId:'missing-search',purpose:'employee_testimony' as const,query:'A synthetic public testimony search',status:'found' as const,urls:[updateSources[1].url],searchedAt:now.toISOString()}];bound=bindCustomerUpdate(input,updateSources,searches);expect(bound.update.coverage!.employee_testimony!.status).toBe('unavailable');expect(bound.blockers.join(' ')).toContain('no relevant discovered testimony');
 });
 it('preserves noncontiguous original passage IDs and adjacent support without generated quotations',()=>{
  const source={...updateSources[1],excerpt:Array.from({length:8},(_,i)=>`Section ${i}: `+'x'.repeat(430)).join('\n\n')};const passages=researchPassages(source),selected=[passages[1],passages[6]],input=submission();input.findings=selected.map(p=>({...input.findings[1],passageId:p.id}));
  const bound=bindCustomerUpdate(input,[source]);expect(researchPassages(bound.sources[0])).toEqual(selected);expect(researchPassages({...bound.sources[0],excerpt:selected[0].text})).toEqual([selected[0]]);
  const adjacent={...input,findings:[{...input.findings[0],supportingPassageIds:[selected[1].id]}]};expect(bindCustomerUpdate(adjacent,[source]).update.findings[0].quote).toBe(selected.map(p=>p.text).join('\n\n'));
  expect(bindCustomerUpdate({...adjacent,findings:[{...adjacent.findings[0],supportingPassageIds:['missing']}]},[source]).update.findings).toEqual([]);
 });
 it('binds both receipt purposes to exact caller/environment/account, original deadline and unchanged payload',()=>{
  vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-contract-secret-not-a-deployed-credential');
  const base={userId:identity.userId,workspaceId:identity.workspaceId,environmentId:identity.environmentId,issuedAt:now.toISOString(),context};const solution=signResearch({...base,brief,sources,blockers:['A retained unresolved blocker']});const update=signCustomerUpdate({...base,...bindCustomerUpdate(submission(),updateSources)});
  expect(verifyResearch(solution,identity,now.getTime())).toBe(true);expect(verifyCustomerUpdate(update,identity,now.getTime())).toBe(true);
  for(const change of [{userId:'other'},{workspaceId:'other'},{environmentId:'production'}]){expect(verifyResearch(solution,{...identity,...change},now.getTime())).toBe(false);expect(verifyCustomerUpdate(update,{...identity,...change},now.getTime())).toBe(false);}
  for(const at of [now.getTime()-1,now.getTime()+3600001]){expect(verifyResearch(solution,identity,at)).toBe(false);expect(verifyCustomerUpdate(update,identity,at)).toBe(false);}
  const altered=structuredClone(solution);altered.payload.blockers=[];expect(verifyResearch(altered,identity,now.getTime())).toBe(false);altered.payload.brief.recommendation='Approve now';expect(verifyResearch(altered,identity,now.getTime())).toBe(false);
  const forged=structuredClone(update);forged.payload.update.accountId='22222222-2222-4222-8222-222222222222';expect(verifyCustomerUpdate(forged,identity,now.getTime())).toBe(false);
  const coverage=structuredClone(update);coverage.payload.update.coverage!.operations_and_limits.status='unavailable';expect(verifyCustomerUpdate(coverage,identity,now.getTime())).toBe(false);
  expect(researchReceiptSchema.safeParse(update).success).toBe(false);expect(researchSubmissionSchema.safeParse({...brief,sourceSupport:[{...brief.sourceSupport[0],quote:undefined,passageId:'retained:p1'}]}).success).toBe(true);
 });
});
