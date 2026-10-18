import {expect,it,vi} from 'vitest';
const feature=vi.hoisted(()=>vi.fn());
vi.mock('../../lib/server/conversations/feature',()=>({responseFeature:feature}));
import ordinary from '../../agent/instructions/normal-chat';
import researchPreview from '../../agent/instructions/research-context';
const context={session:{auth:{current:null}}} as never;
it.each(['planning','staffing','execution','support','expansion','learning'])('keeps the ordinary research prompt out of bounded %s calls',async kind=>{
 feature.mockResolvedValue({kind});
 expect(await ordinary.events['turn.started']!({},context)).toBeNull();
});
it('supplies legacy automatic research in ordinary chat without the old preview prerequisite',async()=>{
 feature.mockResolvedValue({kind:'normal'});
 expect(await ordinary.events['turn.started']!({},context)).not.toBeNull();
 expect(await researchPreview.events['turn.started']!({},context)).toBeNull();
 feature.mockResolvedValue({kind:'planning'});
 expect(await researchPreview.events['turn.started']!({},context)).not.toBeNull();
});
