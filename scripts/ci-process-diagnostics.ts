/** Fixed signatures only. Child output can contain credentials and customer prose;
 * never copy messages, arbitrary paths or unmatched content into CI logs. */
export function processFailureMetadata(value:unknown){
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{},parts=[raw.stdoutTail,raw.stderrTail,raw.message];
 const prose=parts.filter((v):v is string=>typeof v==='string').map(v=>v.slice(-131072)).join('\n');
 const signatures=['ENOSPC','ENOMEM','EADDRINUSE','ECONNREFUSED','SIGKILL','heap out of memory','Cannot find module','Cannot find package','Test timed out','Hook timed out','TimeoutError','Owned production build failed','Disposable production build failed','Disposable production build deadline exceeded','Owned pilot app failed readiness','Owned fixture bootstrap failed','Executable doesn’t exist','browserType.launch','Session not found','Database target binding unavailable'].filter(s=>prose.toLowerCase().includes(s.toLowerCase()));
 const locations=[...new Set([...prose.matchAll(/(?:scripts|tests\/fixtures|tests\/integration\/pilot)\/([a-z][a-z0-9-]*\.(?:ts|mjs)):(\d{1,6}):(\d{1,6})/g)].filter(m=>['pilot-environment.ts','plan-eval-environment.ts','check-ordinary-operations-native.ts','ordinary-knowledge-native.ts','check-ordinary-native-files.ts','load-mcp.test.ts','environment.ts','consumer.ts','build-check.mjs'].includes(m[1])).map(m=>({file:m[0].split(':')[0],line:Number(m[2]),column:Number(m[3])})).map(x=>JSON.stringify(x)))].slice(0,5).map(x=>JSON.parse(x));
 const phases=[...new Set([...prose.matchAll(/\{"kind":"knowledge_native_failure","case":"(include|publish|apply|revoke|withdraw)","phase":"(create|bind|first-proposal|fresh-proposal|approve|receipt|reload|retire)"\}/g)].map(match=>JSON.stringify({case:match[1],phase:match[2]})))].slice(0,5).map(value=>JSON.parse(value));
 let nativeOperations:ReturnType<typeof ordinaryOperationsDiagnostic>;for(const line of prose.split('\n').filter(line=>line.startsWith('{"kind":"native_operations_fixture_failure"')).slice(-3))try{nativeOperations=ordinaryOperationsDiagnostic(JSON.parse(line));}catch{/* Keep unmatched private output private. */}
 return {...(nativeOperations?{nativeOperations}:{}),...(phases.length?{phases}:{}),code:typeof raw.code==='number'&&Number.isInteger(raw.code)&&raw.code>=0&&raw.code<=255?raw.code:null,signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(String(raw.signal))?raw.signal:null,deadlineExpired:raw.deadlineExpired===true,signatures,locations};
}

/** Fixed ordinary native phases and state only. No IDs, messages, native
 * payloads, credentials or arbitrary errors can enter the CI summary. */
export function ordinaryOperationsDiagnostic(value:unknown){
 if(!value||typeof value!=='object')return undefined;const row=value as Record<string,unknown>;if(row.kind!=='native_operations_fixture_failure')return undefined;
 const phases=['scenario','first_pending','intervening_fill','intervening_send','intervening_completion','fresh_approval','member_refusal','changed_source','knowledge'];
 const number=(value:unknown,max=1000000)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=max?value:undefined;
 const send=row.send&&typeof row.send==='object'?row.send as Record<string,unknown>:{};
 const attempts=Array.isArray(row.attempts)?row.attempts.slice(0,8).flatMap(value=>{if(!value||typeof value!=='object')return [];const attempt=value as Record<string,unknown>;return [{responseState:typeof attempt.responseState==='string'&&['pending','running','stopping','waiting_input','completed','cancelled','failed'].includes(attempt.responseState)?attempt.responseState:'unknown',dispatchState:typeof attempt.dispatchState==='string'&&['prepared','dispatching','admitted','uncertain','retryable','rejected'].includes(attempt.dispatchState)?attempt.dispatchState:'unknown',...Object.fromEntries(['intervening','nativeTurnBound','receiptPresent'].filter(key=>typeof attempt[key]==='boolean').map(key=>[key,attempt[key]]))}];}):[];
 const projections=row.projections&&typeof row.projections==='object'?row.projections as Record<string,unknown>:{};
 const rawNativeCode=send.nativeCode??row.nativeCode;
 const nativeCodes=['unavailable','maintenance_unavailable','native_tail_unavailable','dispatch_persist_failed','native_unavailable','turas_dispatch_pending','conversation_busy','dispatch_claimed','native_receipt_changed','session_not_ready','session_not_active','other'];
 const boundaryErrors=Array.isArray(row.boundaryErrors)?row.boundaryErrors.slice(-8).map(code=>typeof code==='string'&&['40P01','40001','23505','57014','55P03','42501','42P01','42703','22P02','57P01'].includes(code)?code:'other'):[];
 return {boundaryErrors,phase:typeof row.phase==='string'&&phases.includes(row.phase)?row.phase:'unknown',send:Object.fromEntries(['messageRequests','nativeRequests','requestFailures','messageStatus','nativeStatus'].filter(key=>number(send[key],key.endsWith('Status')?599:1000000)!==undefined).map(key=>[key,send[key]])),nativeCode:typeof rawNativeCode==='string'&&nativeCodes.includes(rawNativeCode)?rawNativeCode:'unknown',attempts,projections:Object.fromEntries(['message.completed','step.completed','step.failed','turn.started'].filter(key=>number(projections[key])!==undefined).map(key=>[key,projections[key]])),...Object.fromEntries(['fixtureMissingIntervening','diagnosticUnavailable'].filter(key=>typeof row[key]==='boolean').map(key=>[key,row[key]]))};
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
