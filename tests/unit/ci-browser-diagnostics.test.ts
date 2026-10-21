import {artifactAuthStartupPhases} from '../../scripts/artifact-eval-environment';
import {processFailureMetadata,setupFailureMetadata,pilotRegressionFailureMetadata} from '../../scripts/ci-process-diagnostics';
import {describe,expect,it} from 'vitest';
import {browserFailureMetadata,fixedUtilizationMetadata,pilotUiChildFailures} from '../../scripts/ci-browser-diagnostics';
import {nativeQueryOperation,nativeQueryObservationSchema,nativeBlockerMetadata} from '../../scripts/ci-native-query-observer';
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
  const scope={status:200,fromMatches:true,toMatches:true,resourceMatches:false,percentage:'0.00',state:'incomplete',errorCode:null};
  const attachment=(body:unknown)=>({name:'utilization-scope',contentType:'application/json',body:Buffer.from(JSON.stringify(body)).toString('base64')});
  const report=(attachments:unknown[],file='execution-handoff.spec.ts')=>({suites:[{specs:[{file,tests:[{projectName:'webkit-mobile-light',results:[{status:'failed',attachments}]}]}]}]});
  const files=new Set(['execution-handoff.spec.ts','mcp-accessibility.spec.ts']);
  const usage=browserFailureMetadata(report([attachment(scope)]),files)[0].utilization;
  expect(usage).toEqual({status:200,fromMatches:true,toMatches:true,resourceMatches:false,percentageIsExpected:false,state:'incomplete',errorCode:null});
  expect(fixedUtilizationMetadata(usage)).toEqual(usage);
  const privateCodes=browserFailureMetadata(report([attachment({...scope,percentage:'12.50',state:'PRIVATE_STATE',errorCode:'private_customer_token'})]),files);
  expect(privateCodes[0].utilization).toMatchObject({percentageIsExpected:true,state:'other',errorCode:'other'});expect(JSON.stringify(privateCodes)).not.toContain('private_customer_token');expect(JSON.stringify(privateCodes)).not.toContain('PRIVATE_');
  for(const rejected of [
    {name:'utilization-scope',contentType:'application/json',path:'/PRIVATE_PATH'},
    {name:'PRIVATE_NAME',contentType:'application/json',body:attachment(scope).body},
    {name:'utilization-scope',contentType:'text/plain',body:attachment(scope).body},
    {name:'utilization-scope',contentType:'application/json',body:Buffer.from('PRIVATE_MALFORMED').toString('base64')},
    attachment({...scope,extra:'PRIVATE_TOKEN'}),attachment({...scope,percentage:'PRIVATE_PERCENTAGE'}),attachment({...scope,fromMatches:'PRIVATE_BOOL'}),attachment({...scope,status:999}),attachment({...scope,state:'x'.repeat(4096)}),
  ])expect(browserFailureMetadata(report([rejected]),files)[0].utilization).toBeUndefined();
  expect(browserFailureMetadata(report([attachment(scope)],'mcp-accessibility.spec.ts'),files)[0].utilization).toBeUndefined();
  expect(fixedUtilizationMetadata({...usage,state:{toString:()=> 'complete'}})).toBeUndefined();
  expect(fixedUtilizationMetadata({...usage,extra:'PRIVATE_TOKEN'})).toBeUndefined();
 });
});

it('reports setup and child process failure classes without exposing private output',()=>{
 const classified=nativeQueryOperation("SELECT DISTINCT c.id AS conversation_id,request, PRIVATE_SQL 'postgresql://PRIVATE_PASSWORD'");expect(classified).toBe('input-binding');expect(nativeQueryOperation('PRIVATE_SQL')).toBe('other');
 const observation={contract:'owned-native-query-observation-v1',instrumented:true,state:'observed',samples:10,rowsTruncated:false,observations:[{operation:classified,wait:'Lock',samples:2,maximumElapsedMs:5001,blockedSamples:2,blockerOperations:['commit']}]};
 expect(nativeQueryObservationSchema.parse(observation)).toEqual(observation);
 const blocker=nativeBlockerMetadata({pid:777,query:"SELECT active FROM principals WHERE private='PRIVATE_PASSWORD'",state:'idle in transaction',wait_event_type:'Client',elapsed_ms:'4501.8',transaction_elapsed_ms:'8000.1',database:'PRIVATE_CUSTOMER'},['SELECT mode FROM operations_control','PRIVATE_SQL']);
 expect(blocker).toEqual({operation:'principal',state:'idle in transaction',wait:'Client',queryElapsedMs:4502,transactionElapsedMs:8000,blockerOperations:['operations-control','other']});expect(JSON.stringify(blocker)).not.toContain('PRIVATE_');expect(JSON.stringify(blocker)).not.toContain('777');
 const bounded=nativeBlockerMetadata({state:'PRIVATE_STATE',wait_event_type:'PRIVATE_WAIT',elapsed_ms:Infinity,transaction_elapsed_ms:-1});expect(bounded).toMatchObject({state:'other',wait:'other',queryElapsedMs:600000,transactionElapsedMs:0});
 const detailed={...observation,observations:[{...observation.observations[0],blockerDetails:[{operation:blocker.operation,state:blocker.state,wait:blocker.wait,samples:1,maximumQueryElapsedMs:blocker.queryElapsedMs,maximumTransactionElapsedMs:blocker.transactionElapsedMs,blockerOperations:blocker.blockerOperations}],blockerDetailsTruncated:false}]};expect(nativeQueryObservationSchema.parse(detailed)).toEqual(detailed);expect(()=>nativeQueryObservationSchema.parse({...detailed,observations:[{...detailed.observations[0],blockerDetails:[{...detailed.observations[0].blockerDetails[0],query:'PRIVATE_SQL'}]}]})).toThrow();
 for(const extra of [{query:'PRIVATE_SQL'},{database:'PRIVATE_CUSTOMER'},{parameters:['PRIVATE_PASSWORD']},{pid:123}])expect(()=>nativeQueryObservationSchema.parse({...observation,...extra})).toThrow();
 expect(()=>nativeQueryObservationSchema.parse({...observation,observations:[{...observation.observations[0],operation:'PRIVATE_SQL'}]})).toThrow();
 expect(()=>nativeQueryObservationSchema.parse({...observation,observations:[{...observation.observations[0],wait:'PRIVATE_WAIT'}]})).toThrow();expect(JSON.stringify(observation)).not.toContain('PRIVATE_');
 const raw={code:1,signal:'SIGKILL',deadlineExpired:false,stdoutTail:'PRIVATE_TOKEN postgresql://private:password@private/db',stderrTail:'Hook timed out: PRIVATE_PROSE Cannot find module PRIVATE_PATH\n at scripts/pilot-environment.ts:115:7'};
 const result=processFailureMetadata(raw);expect(result).toMatchObject({code:1,signal:'SIGKILL',deadlineExpired:false,signatures:['Cannot find module','Hook timed out'],locations:[{file:'scripts/pilot-environment.ts',line:115,column:7}]});expect(JSON.stringify(result)).not.toContain('PRIVATE_');expect(JSON.stringify(result)).not.toContain('postgresql:');
 const startup=processFailureMetadata({stderrTail:JSON.stringify({kind:'artifact_eval_startup_failure',lastAuthStatus:401,lastEveStatus:null,authTransport:'none',eveTransport:'TimeoutError',probeCount:24,elapsedMs:60001,nextReady:true,compiling:true,eveListening:false,supervisorExited:false,supervisorSignalled:false,signatures:['PRIVATE_TOKEN','ECONNREFUSED'],output:'PRIVATE_LOG',url:'https://PRIVATE_HOST'})});
 expect(startup.artifactStartup).toEqual({lastAuthStatus:401,lastEveStatus:null,authTransport:'none',eveTransport:'TimeoutError',probeCount:24,elapsedMs:60001,nextReady:true,compiling:true,eveListening:false,supervisorExited:false,supervisorSignalled:false,signatures:['ECONNREFUSED']});expect(JSON.stringify(startup)).not.toContain('PRIVATE_');
 expect(artifactAuthStartupPhases('  12 | process.stderr.write("ARTIFACT_AUTH_MODULE\\n");\nPRIVATE_TEXT ARTIFACT_AUTH_HANDLER\n')).toEqual({authModuleObserved:false,authHandlerObserved:false,authSessionObserved:false,authFailureObserved:false});
 expect(artifactAuthStartupPhases('\u001b[32mARTIFACT_AUTH_MODULE\u001b[0m\r\nARTIFACT_AUTH_HANDLER\nARTIFACT_AUTH_SESSION\nARTIFACT_AUTH_FAILURE\n')).toEqual({authModuleObserved:true,authHandlerObserved:true,authSessionObserved:true,authFailureObserved:true});
 const detailedStartup=processFailureMetadata({stderrTail:JSON.stringify({kind:'artifact_eval_startup_failure',nextAddressObserved:true,nextPortMatches:false,authModuleObserved:true,authHandlerObserved:true,authSessionObserved:false,authFailureObserved:false,internalEveStatus:200,internalEveTransport:'none',databaseReachable:true,databaseAdmissionOpen:true,signatures:['ENOSPC','PRIVATE_SIGNATURE'],url:'http://PRIVATE_HOST',query:'PRIVATE_SQL',connection:'PRIVATE_PASSWORD'})});
 expect(detailedStartup.artifactStartup).toMatchObject({nextAddressObserved:true,nextPortMatches:false,authModuleObserved:true,authHandlerObserved:true,authSessionObserved:false,authFailureObserved:false,internalEveStatus:200,internalEveTransport:'none',databaseReachable:true,databaseAdmissionOpen:true,signatures:['ENOSPC']});expect(JSON.stringify(detailedStartup)).not.toContain('PRIVATE_');
 const invalidDetailedStartup=processFailureMetadata({stderrTail:JSON.stringify({kind:'artifact_eval_startup_failure',nextPortMatches:'PRIVATE_BOOLEAN',authHandlerObserved:1,databaseReachable:{private:'PRIVATE_DATA'},internalEveStatus:999,internalEveTransport:'PRIVATE_TRANSPORT'})});
 expect(invalidDetailedStartup.artifactStartup).not.toHaveProperty('nextPortMatches');expect(invalidDetailedStartup.artifactStartup).not.toHaveProperty('authHandlerObserved');expect(invalidDetailedStartup.artifactStartup).not.toHaveProperty('databaseReachable');expect(invalidDetailedStartup.artifactStartup).toMatchObject({internalEveStatus:null,internalEveTransport:'other'});expect(JSON.stringify(invalidDetailedStartup)).not.toContain('PRIVATE_');
 const unsafeStartup=processFailureMetadata({message:JSON.stringify({kind:'artifact_eval_startup_failure',lastAuthStatus:'PRIVATE_STATUS',lastEveStatus:999,authTransport:'PRIVATE_ERROR',eveTransport:{name:'PRIVATE_ERROR'},probeCount:-1,elapsedMs:999999,nextReady:'PRIVATE_BOOLEAN',signatures:['PRIVATE_SIGNATURE']})});
 expect(unsafeStartup.artifactStartup).toEqual({lastAuthStatus:null,lastEveStatus:null,authTransport:'other',eveTransport:'other',probeCount:null,elapsedMs:null,signatures:[]});expect(JSON.stringify(unsafeStartup)).not.toContain('PRIVATE_');
 const native=processFailureMetadata({message:'PRIVATE_PROSE at tests/fixtures/ordinary-knowledge-native.ts:41:7 {"kind":"knowledge_native_failure","case":"include","phase":"fresh-proposal"} {"kind":"knowledge_native_failure","case":"PRIVATE_CASE","phase":"PRIVATE_PHASE"}'});
 expect(native).toMatchObject({locations:[{file:'tests/fixtures/ordinary-knowledge-native.ts',line:41,column:7}],phases:[{case:'include',phase:'fresh-proposal'}]});expect(JSON.stringify(native)).not.toContain('PRIVATE_');
 const operations=processFailureMetadata({stderrTail:JSON.stringify({kind:'native_operations_fixture_failure',phase:'intervening_completion',send:{nativeRequests:1,nativeStatus:503,nativeCode:'unavailable',private:'PRIVATE_TOKEN'},boundaryErrors:['40P01','PRIVATE_TOKEN'],boundaryStages:[{operation:'input-authority',elapsedMs:5001,private:'PRIVATE_TOKEN'},{operation:'PRIVATE_STAGE',elapsedMs:100},{operation:'input-context',elapsedMs:'PRIVATE_TIME'}],attempts:[{responseState:'waiting_input',dispatchState:'admitted',intervening:true,nativeTurnBound:true,receiptPresent:false,text:'PRIVATE_TEXT'},{responseState:'PRIVATE_STATE',dispatchState:'PRIVATE_DISPATCH'}],projections:{'step.failed':1,PRIVATE_EVENT:2},fixtureMissingIntervening:true,private:'PRIVATE_TOKEN'})});
 expect(operations).toMatchObject({nativeOperations:{phase:'intervening_completion',send:{nativeRequests:1,nativeStatus:503},nativeCode:'unavailable',boundaryErrors:['40P01','other'],boundaryStages:[{operation:'input-authority',elapsedMs:5001},{operation:'input-context'}],attempts:[{responseState:'waiting_input',dispatchState:'admitted',intervening:true,nativeTurnBound:true,receiptPresent:false},{responseState:'unknown',dispatchState:'unknown'}],projections:{'step.failed':1},fixtureMissingIntervening:true}});expect(JSON.stringify(operations)).not.toContain('PRIVATE_');expect(processFailureMetadata({stderrTail:JSON.stringify({kind:'native_operations_fixture_failure',...operations.nativeOperations})})).toEqual(operations);
 const prepared=processFailureMetadata({stderrTail:JSON.stringify({kind:'native_operations_fixture_failure',boundaryStages:[{operation:'prepare-owner',elapsedMs:5001,sql:'PRIVATE_SQL'},{operation:'prepare-customer-reads',elapsedMs:5002,values:['PRIVATE_VALUE']}]})});expect(prepared.nativeOperations?.boundaryStages).toEqual([{operation:'prepare-owner',elapsedMs:5001},{operation:'prepare-customer-reads',elapsedMs:5002}]);expect(JSON.stringify(prepared)).not.toContain('PRIVATE_');
 expect(processFailureMetadata({code:'private',signal:'PRIVATE_SIGNAL',message:'PRIVATE_PROSE'})).toEqual({code:null,signal:null,deadlineExpired:false,signatures:[],locations:[]});
 const setup=setupFailureMetadata({stage:'integration-environment',code:1,signal:'SIGKILL',error:{message:'PRIVATE_PROSE Disposable scripts/db-migrate.ts failed: Migration digest mismatch postgresql://PRIVATE_TOKEN',stack:'PRIVATE_STACK at scripts/plan-eval-environment.ts:109:7'}});
 expect(setup).toMatchObject({stage:'integration-environment',operations:['scripts/db-migrate.ts'],setupSignatures:['Migration digest mismatch'],code:1,signal:'SIGKILL',locations:[{file:'scripts/plan-eval-environment.ts',line:109,column:7}]});expect(JSON.stringify(setup)).not.toContain('PRIVATE_');expect(JSON.stringify(setup)).not.toContain('postgresql:');
 expect(setupFailureMetadata({stage:'PRIVATE_STAGE',error:{message:'PRIVATE_MESSAGE',stack:'PRIVATE_PATH'}})).toEqual({stage:'unknown',operations:[],setupSignatures:[],code:null,signal:null,deadlineExpired:false,signatures:[],locations:[]});
});

it('reports fixed regression stages and current-schema counts without private process or test payloads',()=>{
 const files=['tests/integration/foundation.test.ts'];
 const report={success:false,numTotalTests:40,numPassedTests:39,numFailedTests:1,numPendingTests:0,PRIVATE_FIELD:'PRIVATE_PAYLOAD',testResults:[{name:'/private/customer/tests/integration/foundation.test.ts',status:'failed',assertionResults:[{status:'failed',title:'PRIVATE_TITLE',failureMessages:['PRIVATE_PROSE']}]}]};
 const result=pilotRegressionFailureMetadata('current-schema-process',{status:1,error:true,stdout:'PRIVATE_STDOUT',stderr:'PRIVATE_STDERR'},report,files);
 expect(result).toEqual({stage:'current-schema-process',processCode:1,processError:true,reportSuccess:false,counts:{numTotalTests:40,numPassedTests:39,numFailedTests:1,numPendingTests:0},failedFiles:files});
 expect(JSON.stringify(result)).not.toContain('PRIVATE_');expect(JSON.stringify(result)).not.toContain('/private/customer');
 expect(pilotRegressionFailureMetadata('PRIVATE_STAGE',{status:Infinity,error:'PRIVATE_ERROR'},{numTotalTests:-1,numPassedTests:Infinity,testResults:[{name:'PRIVATE_FILE',status:'failed'}]},files)).toEqual({stage:'unknown',processCode:null,processError:false,counts:{},failedFiles:[]});
});
it('revalidates captured pilot UI diagnostics and discards private or malformed child records',()=>{
 const row={kind:'pilot_ui_failure',project:'webkit-mobile-dark',PRIVATE_FIELD:'PRIVATE_PAYLOAD',failedLocations:[{file:'/private/customer/pilot-uploads.spec.ts',line:9,column:2,status:'timedOut',durationMs:30000,signatures:['Timeout','PRIVATE_PROSE','Frame load interrupted'],title:'PRIVATE_TITLE',attachments:['PRIVATE_BYTES']},{file:'PRIVATE_FILE.spec.ts',status:'failed'}]};
 const results=pilotUiChildFailures('PRIVATE_STDERR\n'+JSON.stringify(row)+'\n'+JSON.stringify({kind:'PRIVATE_KIND',failedLocations:row.failedLocations})+'\n{"kind":"pilot_ui_failure"');
 expect(results).toHaveLength(1);expect(results[0]).toMatchObject({file:'pilot-uploads.spec.ts',line:9,column:2,status:'timedOut',project:'webkit-mobile-dark',signatures:['Timeout','Frame load interrupted']});
 expect(JSON.stringify(results)).not.toContain('PRIVATE_');expect(JSON.stringify(results)).not.toContain('/private/customer');
 expect(pilotUiChildFailures(null)).toEqual([]);
 const malformed=pilotUiChildFailures(JSON.stringify({...row,project:'PRIVATE_PROJECT',failedLocations:[{file:'pilot-workspace.spec.ts',line:-1,column:Infinity,status:'failed',durationMs:Infinity,signatures:['PRIVATE_SIGNATURE']}]}));
 expect(malformed[0]).toMatchObject({project:'unknown',line:0,column:0,durationMs:null,signatures:[]});expect(JSON.stringify(malformed)).not.toContain('PRIVATE_');
});
