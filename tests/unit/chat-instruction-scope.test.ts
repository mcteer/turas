import {expect,it,vi} from 'vitest';
const feature=vi.hoisted(()=>vi.fn());
const research=vi.hoisted(()=>vi.fn().mockResolvedValue(false));
vi.mock('../../lib/server/conversations/feature',()=>({responseFeature:feature}));
vi.mock('../../lib/server/research/instruction-scope',()=>({hasBoundResearchAttempt:research}));
import ordinary from '../../agent/instructions/normal-chat';
import researchPreview from '../../agent/instructions/research-context';
const context={session:{auth:{current:null}}} as never;
it.each(['planning','staffing','execution','support','expansion','learning'])('keeps the ordinary research prompt out of bounded %s calls',async kind=>{
 feature.mockResolvedValue({kind});
 expect(await ordinary.events['turn.started']!({},context)).toBeNull();
});
it('supplies legacy automatic research in ordinary chat without the old preview prerequisite',async()=>{
 research.mockResolvedValue(false);
 feature.mockResolvedValue({kind:'normal'});
 expect(await ordinary.events['turn.started']!({},context)).not.toBeNull();
 expect(await researchPreview.events['turn.started']!({},context)).toBeNull();
 feature.mockResolvedValue({kind:'planning'});
 expect(await researchPreview.events['turn.started']!({},context)).not.toBeNull();
});
it('supplies checked-source research instructions only to a normal turn with its own admitted research',async()=>{
 feature.mockResolvedValue({kind:'normal'});
 research.mockResolvedValue(true);
 expect(await researchPreview.events['turn.started']!({},context)).not.toBeNull();
 research.mockResolvedValue(false);
 expect(await researchPreview.events['turn.started']!({},context)).toBeNull();
});
