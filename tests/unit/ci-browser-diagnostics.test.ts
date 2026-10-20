import {processFailureMetadata,setupFailureMetadata} from '../../scripts/ci-process-diagnostics';
import {describe,expect,it} from 'vitest';
import {browserFailureMetadata} from '../../scripts/ci-browser-diagnostics';
const allowed=new Set(['mcp-accessibility.spec.ts']);
describe('private browser failure diagnostics',()=>{
 it('reports the failed source location and timeout class without private error or page content',()=>{
  const raw={suites:[{specs:[{file:'/private/customer/mcp-accessibility.spec.ts',line:5,column:1,title:'PRIVATE_TITLE',tests:[{projectName:'webkit-desktop-dark',results:[{status:'failed',duration:5100,error:{message:'PRIVATE_PROSE Timeout toBeFocused Received ["color-contrast", "private-customer-rule", "color-contrast"]',stack:'PRIVATE_STACK tests/ui/mcp-accessibility.spec.ts:9:24'},stdout:[{text:'PRIVATE_STDOUT'}],attachments:[{body:'PRIVATE_PAGE'}]}]}]}]}]};
  const results=browserFailureMetadata(raw,allowed);
  expect(results).toHaveLength(1);expect(results[0]).toMatchObject({file:'mcp-accessibility.spec.ts',line:9,column:24,project:'webkit-desktop-dark',status:'failed',durationMs:5100,category:'operation_timeout',signatures:['Timeout','toBeFocused']});
  expect(JSON.stringify(results)).not.toContain('PRIVATE_');expect(JSON.stringify(results)).not.toContain('/private/customer');
  const transport=browserFailureMetadata({suites:[{specs:[{file:'mcp-accessibility.spec.ts',tests:[{projectName:'webkit-desktop-dark',results:[{status:'failed',error:{message:'page.reload: PRIVATE_PAGE WebKit encountered an internal error'},steps:[{title:'Reload retained failed history',error:{message:'PRIVATE_PROSE'}},{title:'PRIVATE_PHASE',error:{}}]}]}]}]}]},allowed);
  expect(transport[0]).toMatchObject({signatures:['page.reload','WebKit encountered an internal error'],phases:['Reload retained failed history']});expect(JSON.stringify(transport)).not.toContain('PRIVATE_');
  const learning=browserFailureMetadata({suites:[{specs:[{file:'learning-draft.spec.ts',tests:[{projectName:'webkit-mobile-dark',results:[{status:'timedOut',errors:[{message:'Test timeout PRIVATE_PROSE'}],steps:[{title:'Prepare learning draft',error:{message:'PRIVATE_FORM'}},{title:'PRIVATE_PHASE',error:{}}]}]}]}]}]},new Set(['learning-draft.spec.ts']));
  expect(learning[0]).toMatchObject({category:'test_timeout',phases:['Prepare learning draft']});expect(JSON.stringify(learning)).not.toContain('PRIVATE_');
  expect(results[0].mentionedAccessibilityRules).toEqual(['color-contrast']);expect(JSON.stringify(results)).not.toContain('private-customer-rule');
 });
 it('ignores unapproved files and bounds records, projects and numeric metadata',()=>{
  const result={status:'timedOut',duration:Infinity,error:{message:'Test timeout PRIVATE_PROSE'}};
  const raw={suites:[{specs:[{file:'PRIVATE_FILE.spec.ts',line:1,tests:[{results:[result]}]},{file:'mcp-accessibility.spec.ts',line:-1,column:Infinity,tests:[{projectName:'PRIVATE_PROJECT',results:Array(100).fill(result)}]}]}]};
  const results=browserFailureMetadata(raw,allowed);expect(results).toHaveLength(30);
  expect(results.every(row=>row.file==='mcp-accessibility.spec.ts'&&row.line===0&&row.column===0&&row.project==='unknown'&&row.durationMs===null&&row.category==='test_timeout')).toBe(true);
  expect(JSON.stringify(results)).not.toContain('PRIVATE_');
 });
});

it('reports setup and child process failure classes without exposing private output',()=>{
 const raw={code:1,signal:'SIGKILL',deadlineExpired:false,stdoutTail:'PRIVATE_TOKEN postgresql://private:password@private/db',stderrTail:'Hook timed out: PRIVATE_PROSE Cannot find module PRIVATE_PATH\n at scripts/pilot-environment.ts:115:7'};
 const result=processFailureMetadata(raw);expect(result).toMatchObject({code:1,signal:'SIGKILL',deadlineExpired:false,signatures:['Cannot find module','Hook timed out'],locations:[{file:'scripts/pilot-environment.ts',line:115,column:7}]});expect(JSON.stringify(result)).not.toContain('PRIVATE_');expect(JSON.stringify(result)).not.toContain('postgresql:');
 const native=processFailureMetadata({message:'PRIVATE_PROSE at tests/fixtures/ordinary-knowledge-native.ts:41:7 {"kind":"knowledge_native_failure","case":"include","phase":"fresh-proposal"} {"kind":"knowledge_native_failure","case":"PRIVATE_CASE","phase":"PRIVATE_PHASE"}'});
 expect(native).toMatchObject({locations:[{file:'tests/fixtures/ordinary-knowledge-native.ts',line:41,column:7}],phases:[{case:'include',phase:'fresh-proposal'}]});expect(JSON.stringify(native)).not.toContain('PRIVATE_');
 const operations=processFailureMetadata({stderrTail:JSON.stringify({kind:'native_operations_fixture_failure',phase:'intervening_completion',send:{nativeRequests:1,nativeStatus:503,nativeCode:'unavailable',private:'PRIVATE_TOKEN'},boundaryErrors:['40P01','PRIVATE_TOKEN'],boundaryStages:[{operation:'input-authority',elapsedMs:5001,private:'PRIVATE_TOKEN'},{operation:'PRIVATE_STAGE',elapsedMs:100},{operation:'input-context',elapsedMs:'PRIVATE_TIME'}],attempts:[{responseState:'waiting_input',dispatchState:'admitted',intervening:true,nativeTurnBound:true,receiptPresent:false,text:'PRIVATE_TEXT'},{responseState:'PRIVATE_STATE',dispatchState:'PRIVATE_DISPATCH'}],projections:{'step.failed':1,PRIVATE_EVENT:2},fixtureMissingIntervening:true,private:'PRIVATE_TOKEN'})});
 expect(operations).toMatchObject({nativeOperations:{phase:'intervening_completion',send:{nativeRequests:1,nativeStatus:503},nativeCode:'unavailable',boundaryErrors:['40P01','other'],boundaryStages:[{operation:'input-authority',elapsedMs:5001},{operation:'input-context'}],attempts:[{responseState:'waiting_input',dispatchState:'admitted',intervening:true,nativeTurnBound:true,receiptPresent:false},{responseState:'unknown',dispatchState:'unknown'}],projections:{'step.failed':1},fixtureMissingIntervening:true}});expect(JSON.stringify(operations)).not.toContain('PRIVATE_');expect(processFailureMetadata({stderrTail:JSON.stringify({kind:'native_operations_fixture_failure',...operations.nativeOperations})})).toEqual(operations);
 expect(processFailureMetadata({code:'private',signal:'PRIVATE_SIGNAL',message:'PRIVATE_PROSE'})).toEqual({code:null,signal:null,deadlineExpired:false,signatures:[],locations:[]});
 const setup=setupFailureMetadata({stage:'integration-environment',code:1,signal:'SIGKILL',error:{message:'PRIVATE_PROSE Disposable scripts/db-migrate.ts failed: Migration digest mismatch postgresql://PRIVATE_TOKEN',stack:'PRIVATE_STACK at scripts/plan-eval-environment.ts:109:7'}});
 expect(setup).toMatchObject({stage:'integration-environment',operations:['scripts/db-migrate.ts'],setupSignatures:['Migration digest mismatch'],code:1,signal:'SIGKILL',locations:[{file:'scripts/plan-eval-environment.ts',line:109,column:7}]});expect(JSON.stringify(setup)).not.toContain('PRIVATE_');expect(JSON.stringify(setup)).not.toContain('postgresql:');
 expect(setupFailureMetadata({stage:'PRIVATE_STAGE',error:{message:'PRIVATE_MESSAGE',stack:'PRIVATE_PATH'}})).toEqual({stage:'unknown',operations:[],setupSignatures:[],code:null,signal:null,deadlineExpired:false,signatures:[],locations:[]});
});
