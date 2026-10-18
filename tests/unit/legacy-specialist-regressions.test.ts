import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {context,sources,brief} from '../fixtures/legacy-specialist-contracts';
import {discoveryQueryAllowed,discoveryProvider} from '../../lib/server/research/specialists/solution-research/discovery';
import {independentSearchResults,independentSearchFailure} from '../../lib/server/research/specialists/solution-research/independent-search';
import {rateFreshness,freshnessWindows} from '../../lib/server/research/specialists/solution-research/freshness';
import {sourceFreshness,contextFreshness} from '../../lib/server/research/specialists/solution-research/freshness-report';
import {bindCustomerUpdate,customerUpdateSubmissionSchema} from '../../lib/server/research/specialists/solution-research/customer-update';
import {researchPassages,retainResearchSources} from '../../lib/server/research/specialists/solution-research/source-integrity';
import {bindResearchSubmission,solutionCitationIssues} from '../../lib/server/research/specialists/solution-research/submission';
import {researchGaps} from '../../lib/server/research/specialists/solution-research/schema';
import {researchState} from '../../agent/lib/legacy-research/research-state';
import searchDefinition,{publicDiscoveryProviders} from '../../agent/lib/legacy-research/research-tools/search_public_research';
import passagesDefinition from '../../agent/lib/legacy-research/research-tools/read_research_passages';
import contextDefinition from '../../agent/subagents/implementation-research-worker/tools/get_research_context';
import sourceDefinition from '../../agent/lib/legacy-research/research-tools/read_public_research_source';
import * as contextBoundary from '../../lib/server/research/specialists/solution-research/context';
import {withinResearchBudget} from '../../lib/server/research/specialists/solution-research/evidence';
import {focusSourcePassages} from '../../lib/server/research/specialists/solution-research/source-focus';
import finalizeDefinition from '../../agent/subagents/implementation-research-worker/tools/finalize_research';
// Authentication is a server boundary here, covered independently by domain/native
// tests. Provider calls and identity lookup are replaced; routing/state/finalization
// code below is the real authored implementation and never invokes a paid model.
vi.mock('../../lib/server/research/specialists/identity',()=>({researchIdentity:vi.fn(async auth=>auth?{userId:'synthetic-unit-owner',workspaceId:'synthetic-unit-workspace',environmentId:'test-unit'}:null)}));
vi.mock('../../lib/server/research/specialists/research-cache/database',()=>({cacheEnabled:()=>false}));
const principal={principalType:'user',principalId:'synthetic-unit-owner'};
const ctx=(callId:string,abortSignal=new AbortController().signal)=>({callId,session:{id:'unit-session',auth:{current:principal}},abortSignal});
type Context=ReturnType<typeof ctx>;
type UnitTool={execute:(input:unknown,ctx:Context)=>Promise<Record<string,unknown>>};
const tool=(definition:unknown)=>(definition as {events:{'step.started':()=>UnitTool}}).events['step.started']();
let state:ReturnType<typeof researchState.get>;
beforeEach(()=>{
 state={context:structuredClone(context),sources:structuredClone(sources),calls:{},startedAt:Date.now(),mode:'customer-update'};
 vi.spyOn(researchState,'get').mockImplementation(()=>state);
 vi.spyOn(researchState,'update').mockImplementation(update=>{state=update(state);});
});
afterEach(()=>vi.restoreAllMocks());
describe('legacy specialist discovery receipts',()=>{
 it('keeps testimony discovery open and limits independent attempts to one per category with exact replay routing',()=>{
  for(const purpose of ['employee_testimony','practitioner_experience'] as const){
   expect(discoveryQueryAllowed('SITE:example.org engineer conference',purpose)).toBe(false);
   expect(discoveryQueryAllowed('Example engineer conference webinar',purpose)).toBe(true);
   const receipt={searchId:purpose,purpose,provider:'gateway_exa' as const,status:'unavailable' as const,urls:[]};
   expect(discoveryProvider([],purpose,purpose,'customer-update')).toBe('gateway_exa');
   expect(discoveryProvider([receipt],purpose,'another','customer-update')).toBe('context');
   expect(discoveryProvider([receipt],purpose,purpose,'customer-update')).toBe('gateway_exa');
   expect(discoveryProvider([],purpose,purpose,'solution')).toBe('context');
  }
  expect(discoveryQueryAllowed('site:example.org/releases latest','official')).toBe(true);
 });
 it('shares one official independent fallback across parallel empty searches and preserves provider provenance on replay',async()=>{
  const hint={url:'https://example.org/talk',title:'Synthetic talk',description:'Discovery hint only'};
  const primary=vi.spyOn(publicDiscoveryProviders,'context').mockResolvedValue([]);
  const independent=vi.spyOn(publicDiscoveryProviders,'gateway_exa').mockResolvedValue([hint]);
  const input={query:'Example public product documentation',purpose:'official'};
  const outputs=await Promise.all(['first','second'].map(id=>tool(searchDefinition).execute(input,ctx(id))));
  expect(primary).toHaveBeenCalledTimes(2);expect(independent).toHaveBeenCalledTimes(1);
  const found=outputs.find(x=>x.status==='found')!;expect(found).toMatchObject({provider:'gateway_exa',fallbackFrom:'context',fallbackReason:'empty',results:[hint]});
  expect(state.discoverySearches!.filter(x=>x.fallbackFrom==='context')).toHaveLength(1);
  await tool(searchDefinition).execute(input,ctx(String(found.searchId)));
  expect(primary).toHaveBeenCalledTimes(2);expect(independent).toHaveBeenCalledTimes(2);
  const callsBefore=independent.mock.calls.length;
  expect(await tool(searchDefinition).execute(input,ctx('cancelled',AbortSignal.abort()))).toMatchObject({status:'denied'});
  expect(independent).toHaveBeenCalledTimes(callsBefore);
 });
 it('can recover unavailable official discovery but empty fallback never establishes absence',async()=>{
  vi.spyOn(publicDiscoveryProviders,'context').mockRejectedValue(Error('Synthetic outage'));
  vi.spyOn(publicDiscoveryProviders,'gateway_exa').mockResolvedValue([]);
  expect(await tool(searchDefinition).execute({query:'Example current product documentation',purpose:'official'},ctx('outage'))).toMatchObject({status:'empty',fallbackFrom:'context',fallbackReason:'unavailable',results:[],reason:expect.stringContaining('not evidence that the information does not exist')});
 });
 it('bounds current-state testimony breadth without expanding solution or eight-minute budgets',()=>{
  const eight:Record<string,'scrape'>=Object.fromEntries(Array.from({length:8},(_,index)=>[String(index),'scrape']));
  expect(withinResearchBudget(eight,'ninth','scrape',0,1,'customer-update')).toBe(true);
  expect(withinResearchBudget(eight,'ninth','scrape',0,1,'solution')).toBe(false);
  const twelve={...eight,...Object.fromEntries(Array.from({length:4},(_,index)=>['extra'+index,'scrape' as const]))};
  expect(withinResearchBudget(twelve,'thirteenth','scrape',0,1,'customer-update')).toBe(false);
  expect(withinResearchBudget({},'late','scrape',0,480001,'customer-update')).toBe(false);
 });
 it('validates independent hints and preserves unavailable HTTP status without leaking error prose',()=>{
  expect(independentSearchResults({results:[{url:'https://example.org/talk',title:'Talk',highlights:['Public hint']}]})).toEqual([{url:'https://example.org/talk',title:'Talk',description:'Public hint'}]);
  for(const value of [{error:'timeout'},{results:[{url:'invalid',title:'Bad'}]},{results:Array(11).fill({url:'https://example.org',title:'Too many'})}])expect(()=>independentSearchResults(value)).toThrow();
  const failure=independentSearchFailure([{type:'tool-error',toolName:'exa_search',error:{statusCode:503,message:'PRIVATE_PROVIDER_DETAIL'}}])!;
  expect(failure).toMatchObject({reason:'unavailable',httpStatus:503});expect(failure.message).not.toContain('PRIVATE_PROVIDER_DETAIL');
  expect(independentSearchFailure([{type:'tool-result',toolName:'exa_search',output:{results:[]}}])).toBeNull();
 });
 it('requires actual matching successful open-purpose search receipts before claiming testimony coverage',()=>{
  const source={id:'talk',url:'https://events.example.org/talk',title:'Synthetic engineer talk',retrievedAt:new Date().toISOString(),excerpt:'A customer engineer reports a named feature reached general availability. This is employee testimony.'};
  const na={status:'not_applicable',sourceIds:[],note:'Not applicable to the bounded question.'};
  const submission=customerUpdateSubmissionSchema.parse({accountId:context.accountId,question:'Assess one employee presentation.',findings:[{claim:'An employee reports general availability.',scope:'Employee testimony only',sourceId:source.id,passageId:researchPassages(source)[0].id,publisherType:'other',sourceType:'conference_presentation'}],conflicts:[],unknowns:[],coverage:{release_history:na,current_documentation:na,availability_and_pricing:na,operations_and_limits:na,employee_testimony:{status:'checked',sourceIds:['talk'],searchIds:['search'],note:'Retained the employee testimony after open discovery.'},practitioner_experience:{...na,searchIds:[]}}});
  const search={searchId:'search',purpose:'employee_testimony' as const,status:'found' as const,urls:[source.url]};
  expect(bindCustomerUpdate(submission,[source],[search]).update.coverage!.employee_testimony!.status).toBe('checked');
  for(const receipts of [[],[{...search,status:'empty' as const}],[{...search,status:'unavailable' as const}],[{...search,purpose:'official' as const}],[{...search,urls:['https://example.org/unrelated']}]] )expect(bindCustomerUpdate(submission,[source],receipts).update.coverage!.employee_testimony!.status).toBe('unavailable');
 });
});
describe('legacy specialist freshness and citation contracts',()=>{
 const now=new Date('2026-09-21T12:00:00Z');
 it('expands only known retained passage IDs and denies unknown, unauthenticated, cancelled and finalized reads',async()=>{
  const source=state.sources[0],passage=researchPassages(source)[0],input={sourceId:source.id,passageIds:[passage.id]};
  expect(await tool(passagesDefinition).execute(input,ctx('expand'))).toMatchObject({status:'read',passages:[passage]});
  expect(await tool(passagesDefinition).execute({...input,passageIds:['invented']},ctx('unknown'))).toMatchObject({status:'denied',passages:[]});
  const current=ctx('anonymous'),anonymous={...current,session:{...current.session,auth:{current:undefined}}} as unknown as Context;
  expect(await tool(passagesDefinition).execute(input,anonymous)).toMatchObject({status:'denied',passages:[]});
  expect(await tool(passagesDefinition).execute(input,ctx('cancelled',AbortSignal.abort()))).toMatchObject({status:'denied',passages:[]});
  state.finalized=true;expect(tool(passagesDefinition)).toBeNull();
 });
 it('requires same-account recon and denies missing identity or cancellation before loading context',async()=>{
  const load=vi.spyOn(contextBoundary,'loadResearchContext').mockResolvedValue(context);
  state={...state,context:null,mode:'solution'};
  const authCtx=ctx('context');
  const anonymous={...authCtx,session:{...authCtx.session,auth:{current:undefined}}} as unknown as Context;
  expect(await tool(contextDefinition).execute({accountId:context.accountId},anonymous)).toMatchObject({status:'denied'});
  expect(await tool(contextDefinition).execute({accountId:context.accountId},ctx('cancelled',AbortSignal.abort()))).toMatchObject({status:'denied'});expect(load).not.toHaveBeenCalled();
  expect(await tool(contextDefinition).execute({accountId:context.accountId},authCtx)).toMatchObject({status:'needs_recon'});
  expect(await tool(contextDefinition).execute({accountId:context.accountId,reconReference:{accountId:'22222222-2222-4222-8222-222222222222',researchId:'a'.repeat(64)}},authCtx)).toMatchObject({status:'needs_recon'});
  expect(state.context).toBeNull();
 });
 it('keeps exact focus and preceding-date passages while removing duplicate model-output quotation fields',()=>{
  const source={...sources[0],excerpt:'September 15, 2026\n# Team skills\n'+'Unrelated implementation detail. '.repeat(80)+'\nQueue logs can be inspected.\nAugust 19, 2026\nQueue behavior was introduced.'};
  const matches=focusSourcePassages(source,'Queue');
  expect(matches.length).toBeGreaterThan(0);expect(focusSourcePassages(source,'absent')).toEqual([]);expect(focusSourcePassages(source)).toEqual([]);
  const authored=tool(sourceDefinition) as UnitTool&{toModelOutput:(output:unknown)=>{value:{source:Record<string,unknown>;focusMatches:Array<Record<string,unknown>>;passages:Array<{id:string;text:string}>}}};
  const output=authored.toModelOutput({status:'read',source,truncated:false,focusMatches:matches,reason:'Synthetic retained page'}).value;
  expect(output.source).not.toHaveProperty('excerpt');expect(output.focusMatches.every(match=>!('quote' in match))).toBe(true);
  for(const match of matches){expect(output.passages.some(p=>p.id===match.passageId)).toBe(true);if(match.datePassageId)expect(output.passages.some(p=>p.id===match.datePassageId)).toBe(true);}
  expect(output.passages.every(p=>source.excerpt.includes(p.text))).toBe(true);
 });
 it('retains every topic exact aging boundary, explicit review due, unknown dates and original evidence age',()=>{
  for(const informationType of Object.keys(freshnessWindows) as Array<keyof typeof freshnessWindows>){
   const window=freshnessWindows[informationType];
   for(const [days,rating] of [[window,'recent'],[window+1,'aging'],[window*2,'aging'],[window*2+1,'stale']] as const){const date=new Date(now.getTime()-Number(days)*86400000).toISOString().slice(0,10);expect(rateFreshness({informationType,evidenceDate:date},now)).toMatchObject({rating,ageDays:days});}
  }
  expect(rateFreshness({evidenceDate:'2026-09-20',reviewAfter:'2026-09-21'},now).rating).toBe('stale');
  for(const evidenceDate of [null,undefined,'bad','2026-09-22'])expect(rateFreshness({evidenceDate,checkedAt:now.toISOString()},now)).toMatchObject({rating:'unknown',ageDays:null});
  expect(rateFreshness({evidenceDate:'2025-01-01',checkedAt:now.toISOString()},now).rating).toBe('stale');
 });
 it('uses explicit dated source titles without inventing publication and preserves snapshot evidence age',()=>{
  const source={...sources[0],title:'July 9, 2026 – Synthetic release',publication:null};
  expect(sourceFreshness([source],now)[0]).toMatchObject({evidenceDate:'2026-07-09',dateBasis:'source_title',rating:'stale'});expect(source.publication).toBeNull();
  expect(sourceFreshness([{...source,title:'Synthetic release July 9, 2026'}],now)[0].rating).toBe('unknown');
  expect(contextFreshness({...context,evidence:[{...context.evidence[0],basis:'reviewed_public_snapshot',observedAt:'2025-01-01',reviewAfter:null}]},now)[0]).toMatchObject({rating:'stale',checkedAt:null});
 });
 it('never retains fabricated support as retrieved text and binds selected IDs to original text and dates',()=>{
  const forged={...brief,sourceSupport:[{...brief.sourceSupport[0],quote:'Fabricated source text that never occurred.'}]};
  const retained=retainResearchSources(forged,sources);expect(retained[0].excerpt).not.toContain('Fabricated source text');expect(researchGaps(forged,context,retained)).toContain('Unverified source quotation: '+sources[0].id+'.');
  const original={...sources[0],excerpt:'Published: 2026-09-18\nExact original retained source passage.',publication:{date:'2026-09-18',quote:'Published: 2026-09-18'}};
  const passage=researchPassages(original)[0],submission=structuredClone(brief);submission.sourceSupport[0]={...submission.sourceSupport[0],passageId:passage.id,quote:'Generated forged quotation',publishedAt:'2000-01-01'};
  const bound=bindResearchSubmission(submission,[original,...sources.slice(1)]);expect(bound.brief.sourceSupport[0]).toMatchObject({quote:passage.text,publishedAt:'2026-09-18'});
 });
 it('retains every exact quotation at the eight-support limit without mutating retrieved sources',()=>{
  const quotes=Array.from({length:8},(_,index)=>`${index}:`+'e'.repeat(498));
  const original={...sources[0],excerpt:quotes.join('\n')};
  const assessment={...brief,sourceSupport:quotes.map(quote=>({...brief.sourceSupport[0],quote}))};
  const retained=retainResearchSources(assessment,[original]);
  expect(quotes.every(quote=>retained[0].excerpt.includes(quote))).toBe(true);
  expect(original.excerpt).toBe(quotes.join('\n'));
 });
 it('keeps legitimate customer unknowns out of the evidence-only correction list',()=>{
  const defects=['Unsupported citation in adoption_and_success.','Unsupported alternative citation.','Unverified source passage: source-one.','Unknown customer evidence in technology_stack.','Unverified process-impact input reference.'];
  expect(solutionCitationIssues([...defects,'Customer recon: Unsupported citation in a prior assessment.','Current operating owner is unknown.','Public research cannot establish private engagement status.'])).toEqual(defects);
 });
 it('requests one idempotent evidence-only correction without storing or finalizing unsupported citations',async()=>{
  state={...state,mode:'solution',customerRecon:{accountId:context.accountId,researchId:'a'.repeat(64),checkedAt:new Date().toISOString(),blockers:[]}};
  const submission={...brief,sourceSupport:brief.sourceSupport.slice(1)};
  const result=await tool(finalizeDefinition).execute(submission,ctx('revision-call'));
  expect(result).toMatchObject({status:'needs_revision',reference:null,reason:expect.stringContaining('already retrieved evidence')});expect(state.finalized).toBeUndefined();expect(state.solutionRevisionCallId).toBe('revision-call');
  expect(await tool(finalizeDefinition).execute(submission,ctx('revision-call'))).toEqual(result);
 });
});
