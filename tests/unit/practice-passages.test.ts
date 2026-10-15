import {expect,it} from 'vitest';
import {extractSources} from '../../lib/server/research/specialists/solution-research/evidence';
import {researchPassages} from '../../lib/server/research/specialists/solution-research/source-integrity';
import {retainedPracticePassages} from '../../lib/server/research/specialists/research-cache/practice-passages';

it('returns a late relevant passage in a packed chunk with its complete original text and citation ID',()=>{
 const text='Introductory detail. '.repeat(32)+'\n\nIP rules and custom DNS can bypass domain restrictions. Broad CIDR ranges weaken isolation.\n\nAllowed destinations can receive exfiltrated data; restrict delegated permissions.';
 const source=extractSources({success:true,url:'https://vercel.com/docs/sandbox/concepts/firewall',title:'Firewall',markdown:text},new Date().toISOString())[0];
 const originals=researchPassages(source);
 const chunk=originals.map(p=>p.text).join('\n\n');
 const found=retainedPracticePassages(source,chunk,'IP custom DNS CIDR exfiltrated');
 expect(found[0].text).toContain('custom DNS');
 expect(found.some(p=>p.text.includes('exfiltrated'))).toBe(true);
 for(const passage of found)expect(originals).toContainEqual(passage);
 expect(retainedPracticePassages(source,'unrelated unavailable index content','DNS')).toEqual([]);
});
