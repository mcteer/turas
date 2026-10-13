import {describe,expect,it} from 'vitest';
import {browserFailureMetadata} from '../../scripts/ci-browser-diagnostics';
const allowed=new Set(['mcp-accessibility.spec.ts']);
describe('private browser failure diagnostics',()=>{
 it('reports the failed source location and timeout class without private error or page content',()=>{
  const raw={suites:[{specs:[{file:'/private/customer/mcp-accessibility.spec.ts',line:5,column:1,title:'PRIVATE_TITLE',tests:[{projectName:'webkit-desktop-dark',results:[{status:'failed',duration:5100,error:{message:'PRIVATE_PROSE Timeout toBeFocused',stack:'PRIVATE_STACK tests/ui/mcp-accessibility.spec.ts:9:24'},stdout:[{text:'PRIVATE_STDOUT'}],attachments:[{body:'PRIVATE_PAGE'}]}]}]}]}]};
  const results=browserFailureMetadata(raw,allowed);
  expect(results).toHaveLength(1);expect(results[0]).toMatchObject({file:'mcp-accessibility.spec.ts',line:9,column:24,project:'webkit-desktop-dark',status:'failed',durationMs:5100,category:'operation_timeout',signatures:['Timeout','toBeFocused']});
  expect(JSON.stringify(results)).not.toContain('PRIVATE_');expect(JSON.stringify(results)).not.toContain('/private/customer');
 });
 it('ignores unapproved files and bounds records, projects and numeric metadata',()=>{
  const result={status:'timedOut',duration:Infinity,error:{message:'Test timeout PRIVATE_PROSE'}};
  const raw={suites:[{specs:[{file:'PRIVATE_FILE.spec.ts',line:1,tests:[{results:[result]}]},{file:'mcp-accessibility.spec.ts',line:-1,column:Infinity,tests:[{projectName:'PRIVATE_PROJECT',results:Array(100).fill(result)}]}]}]};
  const results=browserFailureMetadata(raw,allowed);expect(results).toHaveLength(30);
  expect(results.every(row=>row.file==='mcp-accessibility.spec.ts'&&row.line===0&&row.column===0&&row.project==='unknown'&&row.durationMs===null&&row.category==='test_timeout')).toBe(true);
  expect(JSON.stringify(results)).not.toContain('PRIVATE_');
 });
});
