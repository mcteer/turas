import {expect,it,vi} from 'vitest';
const feature=vi.hoisted(()=>vi.fn());
const research=vi.hoisted(()=>vi.fn().mockResolvedValue(false));
vi.mock('../../lib/server/conversations/feature',()=>({responseFeature:feature}));
vi.mock('../../lib/server/research/instruction-scope',()=>({hasBoundResearchAttempt:research}));
import ordinary from '../../agent/instructions/normal-chat';
import retrieval from '../../agent/instructions/retrieval-context';
import researchPreview from '../../agent/instructions/research-context';
import priorRead from '../../agent/instructions/research-read-context';
const context={session:{auth:{current:null}}} as never;
it.each(['planning','staffing','execution','support','expansion','learning'])('keeps the ordinary research prompt out of bounded %s calls',async kind=>{
 feature.mockResolvedValue({kind});
 expect(await ordinary.events['turn.started']!({},context)).toBeNull();
 expect(await priorRead.events['turn.started']!({},context)).toBeNull();
});
it('supplies legacy automatic research in ordinary chat without the old preview prerequisite',async()=>{
 research.mockResolvedValue(false);
 feature.mockResolvedValue({kind:'normal'});
 expect(await ordinary.events['turn.started']!({},context)).not.toBeNull();
 expect(await researchPreview.events['turn.started']!({},context)).toBeNull();
 const history=await priorRead.events['turn.started']!({},context);
 expect(history).toMatchObject({content:expect.stringContaining('[sourceRevisionId]')});
 expect(history).toMatchObject({content:expect.stringContaining('at most 80 words')});
 expect(history).toMatchObject({content:expect.stringContaining('Do not restart or launch research')});
 feature.mockResolvedValue({kind:'planning'});
 expect(await researchPreview.events['turn.started']!({},context)).not.toBeNull();
 expect(await priorRead.events['turn.started']!({},context)).toBeNull();
});
it('supplies checked-source research instructions only to a normal turn with its own admitted research',async()=>{
 feature.mockResolvedValue({kind:'normal'});
 research.mockResolvedValue(true);
 expect(await researchPreview.events['turn.started']!({},context)).not.toBeNull();
 expect(await priorRead.events['turn.started']!({},context)).toBeNull();
 research.mockResolvedValue(false);
 expect(await researchPreview.events['turn.started']!({},context)).toBeNull();
 expect(await priorRead.events['turn.started']!({},context)).not.toBeNull();
 feature.mockResolvedValue(null);
 expect(await priorRead.events['turn.started']!({},context)).toBeNull();
});

it('supplies ordinary conflict discovery without requiring retrieval for unrelated technical questions',async()=>{
 feature.mockResolvedValue({kind:'normal'});
 const instruction=await retrieval.events['turn.started']!({},context);
 expect(instruction).toMatchObject({content:expect.stringContaining('use discovery')});
 expect(instruction).toMatchObject({content:expect.stringContaining('Other ordinary technical questions may still be answered directly')});
});
it.each(['staffing','execution','expansion','learning'])('keeps ordinary conflict guidance out of governed %s calls',async kind=>{
 feature.mockResolvedValue({kind});
 expect(await retrieval.events['turn.started']!({},context)).toBeNull();
});
