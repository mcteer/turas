/** Fixed owned cancellation source and native child error class; never error prose. */
export function pilotCatalogAbortMetadata(cause:unknown,error:unknown){
 const row=error&&typeof error==='object'?error as Record<string,unknown>:{};
 return {cancellationCause:typeof cause==='string'&&['none','deadline','signal'].includes(cause)?cause:'unavailable',processErrorName:typeof row.name==='string'&&['AbortError','Error','TypeError','RangeError'].includes(row.name)?row.name:error?'other':null,processErrorCode:typeof row.code==='string'&&['ABORT_ERR','EAGAIN','ENOENT','EACCES','ENOMEM','EMFILE','ENFILE'].includes(row.code)?row.code:null};
}
/** Recovery-case clocks and fixed phases only; no errors, URLs or row content. */
export function workMcpCaseFailureMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const phases=new Set(['setup','initial-category','bounded-category-prefix','network-tamper-single','network-tamper-window','current-denial-refresh','negative-drift','paginated-knowledge','current-scope','remaining-categories','mixed-canonical-and-hosted-branches','service-http','parallel-final-drift','final-scope-replay','pre-producer-retirement','producer','producer-cron','producer-old-http','producer-native','producer-sandbox','producer-final','producer-service','producer-effects','producer-integrity','explicit-fresh-attempt']);
 const phase=(value:unknown)=>typeof value==='string'&&/^remaining-categories-\d{1,4}$/.test(value)?'remaining-categories':typeof value==='string'&&phases.has(value)?value:'unknown';
 const milliseconds=(value:unknown,minimum=0)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=minimum&&value<=450000?value:null;
 const stages=Array.isArray(row.stages)?row.stages.slice(-32).map(value=>{const stage=value&&typeof value==='object'?value as Record<string,unknown>:{};return {phase:phase(stage.phase),elapsedMs:milliseconds(stage.elapsedMs),targetRemainingMs:milliseconds(stage.targetRemainingMs,-450000)};}):[];
 return {phase:phase(row.phase),elapsedMs:milliseconds(row.elapsedMs),targetRemainingMs:milliseconds(row.targetRemainingMs,-450000),caseSignalAborted:row.caseSignalAborted===true,errorName:typeof row.errorName==='string'&&['Error','TimeoutError','AbortError','AggregateError'].includes(row.errorName)?row.errorName:'other',stages};
}
/** Fixed recovery HTTP phases only. Never include child logs, routes, keys,
 * database identities, response bytes or arbitrary exception messages. */
export function recoveryServerStartupPhases(output:string){
 const lines=new Set(output.replace(/\x1b\[[0-9;]*[A-Za-z]/g,'').split(/\r?\n/));
 return {serverModuleObserved:lines.has('OWNED_RECOVERY_SERVER_MODULE'),serverPrepareStartedObserved:lines.has('OWNED_RECOVERY_SERVER_PREPARE_START'),serverPrepareCompletedObserved:lines.has('OWNED_RECOVERY_SERVER_PREPARE_END'),serverListenStartedObserved:lines.has('OWNED_RECOVERY_SERVER_LISTEN_START'),serverStopObserved:lines.has('OWNED_RECOVERY_SERVER_STOP'),listenerTextObserved:lines.has('Ready in owned recovery server')};
}
export function recoveryApplicationFailureMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const bounded=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=1200000?v:null;
 return {kind:'owned_recovery_application_failure',phase:typeof row.phase==='string'&&['listener','auth-readiness','callback','protected-warmup','retirement'].includes(row.phase)?row.phase:'unknown',
  ...(typeof row.warming==='boolean'?{warming:row.warming}:{}),
  ...(typeof row.surface==='string'&&['profile','artifact','report','workforce','gap','plan','execution'].includes(row.surface)?{surface:row.surface}:{}),
  errorName:typeof row.errorName==='string'&&['Error','TimeoutError','AbortError','OwnedProcessRetirementError'].includes(row.errorName)?row.errorName:'other',
  elapsedMs:bounded(row.elapsedMs),remainingMs:bounded(row.remainingMs),
  authStatus:typeof row.authStatus==='number'&&Number.isInteger(row.authStatus)&&row.authStatus>=100&&row.authStatus<=599?row.authStatus:null,
  ...Object.fromEntries(['serverModuleObserved','serverPrepareStartedObserved','serverPrepareCompletedObserved','serverListenStartedObserved','serverStopObserved','listenerTextObserved','compilingTextObserved','childExited','childSignalled','childErrorObserved','callerSignalAborted','runtimeSignalAborted','ownedDeadlineExpired'].filter(k=>typeof row[k]==='boolean').map(k=>[k,row[k]]))};
}
/** Fixed signatures only. Child output can contain credentials and customer prose;
 * never copy messages, arbitrary paths or unmatched content into CI logs. */
const pilotRegressionStages=new Set(['predecessor-process','predecessor-receipt','current-schema-setup','current-schema-process','current-schema-report','current-schema-cleanup','fresh-ui-process','fresh-ui-receipt','final-source','final-evidence']);
/** Controller phases and numeric outcomes only. Private test prose is excluded. */
export function pilotRegressionFailureMetadata(stage:unknown,process:unknown,report:unknown,allowedFiles:readonly string[]){
 const raw=report&&typeof report==='object'?report as Record<string,unknown>:{};
 const child=process&&typeof process==='object'?process as Record<string,unknown>:{};
 const integer=(value:unknown,max=100000)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:null;
 const counts=Object.fromEntries(['numTotalTests','numPassedTests','numFailedTests','numPendingTests'].filter(key=>integer(raw[key])!==null).map(key=>[key,integer(raw[key])]));
 const failedFiles:string[]=[];
 if(Array.isArray(raw.testResults))for(const suite of raw.testResults.slice(0,64)){
  if(!suite||typeof suite!=='object'||typeof suite.name!=='string')continue;
  const file=allowedFiles.find(file=>suite.name===file||suite.name.endsWith('/'+file));
  if(file&&(suite.status==='failed'||Array.isArray(suite.assertionResults)&&suite.assertionResults.slice(0,1000).some((test:unknown)=>test&&typeof test==='object'&&(test as Record<string,unknown>).status==='failed')))failedFiles.push(file);
 }
 return {stage:typeof stage==='string'&&pilotRegressionStages.has(stage)?stage:'unknown',processCode:integer(child.status,255),processError:child.error===true,
  ...(typeof raw.success==='boolean'?{reportSuccess:raw.success}:{}),counts,failedFiles:[...new Set(failedFiles)].slice(0,16)};
}
/** Fixed workforce recovery failure state only. No identifiers, file contents,
 * paths, native output, exception prose or arbitrary database values escape. */
export function workforceRecoveryFailureMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const fixed=(v:unknown,allowed:readonly string[])=>typeof v==='string'&&allowed.includes(v)?v:'unknown';
 const integer=(v:unknown,max:number)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max?v:null;
 const failures=['unsafe_content','scan_unavailable','scan_stale','parser_timeout','parser_failed','limit_exceeded','source_changed','unsupported_format','encrypted','malformed','renderer_failed','renderer_browser_failed','renderer_validation_failed'];
 const native=Array.isArray(row.native)?row.native.slice(-4).map(value=>{const n=value&&typeof value==='object'?value as Record<string,unknown>:{};return {kind:fixed(n.kind,['artifact-scan','workforce-parse']),exitCode:integer(n.exitCode,255),durationMs:integer(n.durationMs,300000),safeFailure:fixed(n.safeFailure,failures),error:fixed(n.error,['none','deadline','cleanup','unavailable','output_limit','source_changed','other']),scanClean:typeof n.scanClean==='boolean'?n.scanClean:null,scanFound:typeof n.scanFound==='boolean'?n.scanFound:null};}):[];
 return {kind:'workforce_recovery_failure',surface:fixed(row.surface,['artifact','report','workforce','gap','command']),diagnosticUnavailable:row.diagnosticUnavailable===true,sourceState:fixed(row.sourceState,['quarantined','processing','ready','partial','reviewed','failed','withdrawn']),jobState:fixed(row.jobState,['queued','running','ready','partial','failed','cancelled']),errorCode:fixed(row.errorCode,failures),attemptNumber:integer(row.attemptNumber,4),currentVersionMatches:typeof row.currentVersionMatches==='boolean'?row.currentVersionMatches:null,leaseActive:typeof row.leaseActive==='boolean'?row.leaseActive:null,deadlineActive:typeof row.deadlineActive==='boolean'?row.deadlineActive:null,native};
}
/** Numeric reporter observations only. A present report is not a process pass. */
export function vitestReportOutcome(value:unknown){
 const row=value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
 const keys=['numTotalTests','numPassedTests','numFailedTests','numPendingTests','numTodoTests'];
 if(typeof row.success!=='boolean'||!Array.isArray(row.testResults)||keys.some(key=>typeof row[key]!=='number'||!Number.isSafeInteger(row[key])||Number(row[key])<0||Number(row[key])>100000))return {reportState:'invalid' as const};
 return {reportState:'present' as const,reportSuccess:row.success,...Object.fromEntries(keys.map(key=>[key,row[key]]))};
}
export function processFailureMetadata(value:unknown){
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{},parts=[raw.stdoutTail,raw.stderrTail,raw.message];
 const prose=parts.filter((v):v is string=>typeof v==='string').map(v=>v.slice(-131072)).join('\n');
 const signatures=['ENOSPC','ENOMEM','EADDRINUSE','ECONNREFUSED','SIGKILL','heap out of memory','Cannot find module','Cannot find package','Test timed out','Hook timed out','TimeoutError','Owned production build failed','Disposable production build failed','Disposable production build deadline exceeded','Owned pilot app failed readiness','Owned fixture bootstrap failed','Executable doesn’t exist','browserType.launch','Session not found','Database target binding unavailable','Connection terminated unexpectedly','terminating connection due to administrator command','Client has encountered a connection error and is not queryable','Unhandled Error','Unhandled Rejection'].filter(s=>prose.toLowerCase().includes(s.toLowerCase()));
 const locations=[...new Set([...prose.matchAll(/(?:scripts|tests\/fixtures|tests\/integration\/pilot)\/([a-z][a-z0-9-]*\.(?:ts|mjs)):(\d{1,6}):(\d{1,6})/g)].filter(m=>['pilot-environment.ts','plan-eval-environment.ts','check-ordinary-operations-native.ts','ordinary-knowledge-native.ts','check-ordinary-native-files.ts','load-mcp.test.ts','environment.ts','consumer.ts','build-check.mjs'].includes(m[1])).map(m=>({file:m[0].split(':')[0],line:Number(m[2]),column:Number(m[3])})).map(x=>JSON.stringify(x)))].slice(0,5).map(x=>JSON.parse(x));
 const phases=[...new Set([...prose.matchAll(/\{"kind":"knowledge_native_failure","case":"(include|publish|apply|revoke|withdraw)","phase":"(create|bind|first-proposal|fresh-proposal|approve|receipt|reload|retire)"\}/g)].map(match=>JSON.stringify({case:match[1],phase:match[2]})))].slice(0,5).map(value=>JSON.parse(value));
 let nativeOperations:ReturnType<typeof ordinaryOperationsDiagnostic>;for(const line of prose.split('\n').filter(line=>line.startsWith('{"kind":"native_operations_fixture_failure"')).slice(-3))try{nativeOperations=ordinaryOperationsDiagnostic(JSON.parse(line));}catch{/* Keep unmatched private output private. */}
 let artifactStartup:ReturnType<typeof artifactStartupDiagnostic>;for(const line of prose.split('\n').filter(line=>line.startsWith('{"kind":"artifact_eval_startup_failure"')).slice(-3))try{artifactStartup=artifactStartupDiagnostic(JSON.parse(line));}catch{/* Keep unmatched private output private. */}
 const evaluationSourceStages=prose.split('\n').filter(line=>line.startsWith('{"kind":"evaluation_source_stage"')).flatMap(line=>{try{const row=JSON.parse(line);return row&&row.kind==='evaluation_source_stage'&&['artifact','retrieval','plan'].includes(row.phase)&&['start','complete'].includes(row.state)&&Number.isSafeInteger(row.elapsedMs)&&row.elapsedMs>=0&&row.elapsedMs<=630000?[{phase:row.phase as 'artifact'|'retrieval'|'plan',state:row.state as 'start'|'complete',elapsedMs:row.elapsedMs as number}]:[];}catch{return [];}}).slice(-6);
 const workforceRecovery=prose.split('\n').filter(line=>line.startsWith('{"kind":"workforce_recovery_failure"')).slice(-3).flatMap(line=>{try{return [workforceRecoveryFailureMetadata(JSON.parse(line))];}catch{return [];}});
 const recoveryApplication=prose.split('\n').filter(line=>line.startsWith('{"kind":"owned_recovery_application_failure"')).slice(-3).flatMap(line=>{try{return [recoveryApplicationFailureMetadata(JSON.parse(line))];}catch{return [];}});
 const workMcpCases=prose.split('\n').filter(line=>line.startsWith('{"kind":"work_mcp_case_failure"')).slice(-3).flatMap(line=>{try{return [workMcpCaseFailureMetadata(JSON.parse(line))];}catch{return [];}});
 return {...(evaluationSourceStages.length?{evaluationSourceStages}:{}),...(workforceRecovery.length?{workforceRecovery}:{}),...(workMcpCases.length?{workMcpCases}:{}),...(recoveryApplication.length?{recoveryApplication}:{}),...(artifactStartup?{artifactStartup}:{}),...(nativeOperations?{nativeOperations}:{}),...(phases.length?{phases}:{}),code:typeof raw.code==='number'&&Number.isInteger(raw.code)&&raw.code>=0&&raw.code<=255?raw.code:null,signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(String(raw.signal))?raw.signal:null,deadlineExpired:raw.deadlineExpired===true,signatures,locations};
}

/** Independent route outcomes and fixed startup phases only; never raw logs. */
function artifactStartupDiagnostic(value:unknown){
 if(!value||typeof value!=='object')return undefined;const row=value as Record<string,unknown>;if(row.kind!=='artifact_eval_startup_failure')return undefined;
 const status=(value:unknown)=>typeof value==='number'&&Number.isInteger(value)&&value>=100&&value<=599?value:null;
 const transport=(value:unknown)=>typeof value==='string'&&['none','unavailable','TimeoutError','AbortError','TypeError'].includes(value)?value:'other';
 const bounded=(value:unknown,max:number)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:null;
 const httpObservation=(value:unknown)=>{
  if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
  const probe=value as Record<string,unknown>;
  return {...Object.fromEntries(['tcpConnected','headersReceived'].filter(name=>typeof probe[name]==='boolean').map(name=>[name,probe[name]])),status:status(probe.status),elapsedMs:bounded(probe.elapsedMs,120000),error:typeof probe.error==='string'&&['none','deadline','invalid-port','ECONNREFUSED','ECONNRESET','EPIPE','ETIMEDOUT','ENETUNREACH','EHOSTUNREACH','ABORT_ERR'].includes(probe.error)?probe.error:'other'};
 };
 const staticHttp=httpObservation(row.staticHttp),publicHealthHttp=httpObservation(row.publicHealthHttp),authHttp=httpObservation(row.authHttp);
 return {lastAuthStatus:status(row.lastAuthStatus),lastEveStatus:status(row.lastEveStatus),authTransport:transport(row.authTransport),eveTransport:transport(row.eveTransport),probeCount:bounded(row.probeCount,1000),elapsedMs:bounded(row.elapsedMs,120000),
  ...Object.fromEntries(['supervisorExited','supervisorSignalled','nextReady','compiling','eveListening','nextAddressObserved','nextPortMatches','authModuleObserved','authHandlerObserved','authSessionObserved','authFailureObserved','databaseReachable','databaseAdmissionOpen'].filter(key=>typeof row[key]==='boolean').map(key=>[key,row[key]])),
  ...(Object.hasOwn(row,'internalEveStatus')?{internalEveStatus:status(row.internalEveStatus),internalEveTransport:transport(row.internalEveTransport)}:{}),
  ...(staticHttp?{staticHttp}:{}),...(publicHealthHttp?{publicHealthHttp}:{}),...(authHttp?{authHttp}:{}),
  ...(row.staticFetch&&typeof row.staticFetch==='object'&&!Array.isArray(row.staticFetch)?{staticFetch:{status:status((row.staticFetch as Record<string,unknown>).status),transport:transport((row.staticFetch as Record<string,unknown>).transport),elapsedMs:bounded((row.staticFetch as Record<string,unknown>).elapsedMs,120000)}}:{}),
  ...(row.authFetch&&typeof row.authFetch==='object'&&!Array.isArray(row.authFetch)?{authFetch:{status:status((row.authFetch as Record<string,unknown>).status),transport:transport((row.authFetch as Record<string,unknown>).transport),elapsedMs:bounded((row.authFetch as Record<string,unknown>).elapsedMs,120000)}}:{}),
  ...(typeof row.transportDiagnosticUnavailable==='boolean'?{transportDiagnosticUnavailable:row.transportDiagnosticUnavailable}:{}),
  ...(Array.isArray(row.authPhases)?{authPhases:row.authPhases.slice(-128).flatMap(value=>{
   if(!value||typeof value!=='object'||Array.isArray(value))return [];const event=value as Record<string,unknown>,elapsedMs=bounded(event.elapsedMs,120000);
   return typeof event.phase==='string'&&['module','handler','session','catch','response'].includes(event.phase)&&elapsedMs!==null?[{phase:event.phase,elapsedMs}]:[];
  })}:{}),
  ...(Array.isArray(row.readinessProbes)?{readinessProbes:row.readinessProbes.slice(-64).flatMap(value=>{
   if(!value||typeof value!=='object'||Array.isArray(value))return [];const probe=value as Record<string,unknown>,ordinal=bounded(probe.ordinal,1000),startedMs=bounded(probe.startedMs,120000),completedMs=bounded(probe.completedMs,120000);
   return ordinal!==null&&ordinal>0&&startedMs!==null&&completedMs!==null&&completedMs>=startedMs?[{ordinal,startedMs,completedMs,authStatus:status(probe.authStatus),eveStatus:status(probe.eveStatus),authTransport:transport(probe.authTransport),eveTransport:transport(probe.eveTransport),...Object.fromEntries(['authPhase','evePhase'].filter(key=>typeof probe[key]==='string'&&['request','body-cancel','complete'].includes(probe[key] as string)).map(key=>[key,probe[key]])),...Object.fromEntries(['authHeadersStatus','eveHeadersStatus'].filter(key=>Object.hasOwn(probe,key)).map(key=>[key,status(probe[key])])),...Object.fromEntries(['authHeadersElapsedMs','eveHeadersElapsedMs'].filter(key=>Object.hasOwn(probe,key)).map(key=>[key,bounded(probe[key],120000)]))}]:[];
  })}:{}),
  signatures:Array.isArray(row.signatures)?row.signatures.filter(value=>typeof value==='string'&&['EADDRINUSE','ECONNREFUSED','Module not found','Cannot find module','Failed to compile','Error:','ENOSPC','EMFILE','ENOMEM','Turbopack panic'].includes(value)).slice(0,10):[]};
}

/** Fixed ordinary native phases and state only. No IDs, messages, native
 * payloads, credentials or arbitrary errors can enter the CI summary. */
export function ordinaryOperationsDiagnostic(value:unknown){
 if(!value||typeof value!=='object')return undefined;const row=value as Record<string,unknown>;if(row.kind!=='native_operations_fixture_failure')return undefined;
 const phases=['scenario','first_pending','intervening_fill','intervening_send','intervening_completion','fresh_approval','member_refusal','changed_source','changed_source_overview','changed_source_revise','knowledge'];
 const number=(value:unknown,max=1000000)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:undefined;
 const send=row.send&&typeof row.send==='object'?row.send as Record<string,unknown>:{};
 const attempts=Array.isArray(row.attempts)?row.attempts.slice(0,8).flatMap(value=>{if(!value||typeof value!=='object')return [];const attempt=value as Record<string,unknown>;return [{responseState:typeof attempt.responseState==='string'&&['pending','running','stopping','waiting_input','completed','cancelled','failed'].includes(attempt.responseState)?attempt.responseState:'unknown',dispatchState:typeof attempt.dispatchState==='string'&&['prepared','dispatching','admitted','uncertain','retryable','rejected'].includes(attempt.dispatchState)?attempt.dispatchState:'unknown',...Object.fromEntries(['intervening','nativeTurnBound','receiptPresent'].filter(key=>typeof attempt[key]==='boolean').map(key=>[key,attempt[key]]))}];}):[];
 const projections=row.projections&&typeof row.projections==='object'?row.projections as Record<string,unknown>:{};
 const rawNativeCode=send.nativeCode??row.nativeCode;
 const nativeCodes=['unavailable','maintenance_unavailable','native_tail_unavailable','dispatch_persist_failed','native_unavailable','turas_dispatch_pending','conversation_busy','dispatch_claimed','native_receipt_changed','session_not_ready','session_not_active','other'];
 const boundaryErrors=Array.isArray(row.boundaryErrors)?row.boundaryErrors.slice(-8).map(code=>typeof code==='string'&&['40P01','40001','23505','57014','55P03','42501','42P01','42703','22P02','57P01'].includes(code)?code:'other'):[];
 const boundaryStages=Array.isArray(row.boundaryStages)?row.boundaryStages.slice(-8).flatMap(value=>{if(!value||typeof value!=='object')return [];const stage=value as Record<string,unknown>;if(typeof stage.operation!=='string'||!['prepare-feature','prepare-environment','prepare-owner','prepare-admission','prepare-planning','prepare-context','prepare-artifacts','prepare-customer-reads','prepare-replay','prepare-active','prepare-heartbeat','prepare-quota','prepare-message','prepare-title','prepare-attempt','native-route','session','implicit-question','ordinary-owner','ordinary-worker','ordinary-prepare','ordinary-tail','ordinary-dispatch','ordinary-forward','input-owner','input-authority','input-worker','input-context','input-forward'].includes(stage.operation))return [];return [{operation:stage.operation,...(number(stage.elapsedMs,1200000)===undefined?{}:{elapsedMs:stage.elapsedMs})}];}):[];
 return {...(boundaryStages.length?{boundaryStages}:{}),boundaryErrors,phase:typeof row.phase==='string'&&phases.includes(row.phase)?row.phase:'unknown',send:Object.fromEntries(['messageRequests','nativeRequests','requestFailures','messageStatus','nativeStatus'].filter(key=>number(send[key],key.endsWith('Status')?599:1000000)!==undefined).map(key=>[key,send[key]])),nativeCode:typeof rawNativeCode==='string'&&nativeCodes.includes(rawNativeCode)?rawNativeCode:'unknown',attempts,projections:Object.fromEntries(['message.completed','step.completed','step.failed','turn.started'].filter(key=>number(projections[key])!==undefined).map(key=>[key,projections[key]])),...Object.fromEntries(['fixtureMissingIntervening','diagnosticUnavailable'].filter(key=>typeof row[key]==='boolean').map(key=>[key,row[key]]))};
}

/** Controllers sometimes fail before a test report exists. Classify only fixed
 * setup operations; neither an exception message nor its arbitrary paths escape. */
export function setupFailureMetadata(value:unknown){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{},error=row.error&&typeof row.error==='object'?row.error as Record<string,unknown>:row;
 const message=[error.message,error.stack].filter((v):v is string=>typeof v==='string').map(v=>v.slice(-131072)).join('\n');
 const stages=['manifest','unit-tests','unit-report','integration-environment','integration-tests','source-check','suite-or-owned-environment','ui-discovery','ui-environment','ui-case','ui-report'];
 const operations=['scripts/db-migrate.ts','scripts/db-roles.ts','scripts/bootstrap-demo.ts'].filter(file=>message.includes(file));
 const signatures=['Owned local setup failed','Disposable clone','Marked disposable test source required','Disposable production build failed','Disposable app failed readiness','Report UI discovery failed','Prior-feature integration failed','Report suite failed','Regression source changed','Report source changed','Report UI source changed','Migration digest mismatch','Migration manifest does not match','Turas configuration invalid','Rendered binding changed'];
 return {stage:typeof row.stage==='string'&&stages.includes(row.stage)?row.stage:'unknown',operations,setupSignatures:signatures.filter(s=>message.includes(s)),...processFailureMetadata({message,code:row.code,signal:row.signal})};
}
