/** Fixed signatures only. Child output can contain credentials and customer prose;
 * never copy messages, arbitrary paths or unmatched content into CI logs. */
export function processFailureMetadata(value:unknown){
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{},parts=[raw.stdoutTail,raw.stderrTail,raw.message];
 const prose=parts.filter((v):v is string=>typeof v==='string').map(v=>v.slice(-131072)).join('\n');
 const signatures=['ENOSPC','ENOMEM','EADDRINUSE','ECONNREFUSED','SIGKILL','heap out of memory','Cannot find module','Cannot find package','Test timed out','Hook timed out','TimeoutError','Owned production build failed','Disposable production build failed','Disposable production build deadline exceeded','Owned pilot app failed readiness','Owned fixture bootstrap failed','Executable doesn’t exist','browserType.launch','Session not found','Database target binding unavailable'].filter(s=>prose.toLowerCase().includes(s.toLowerCase()));
 const locations=[...new Set([...prose.matchAll(/(?:scripts|tests\/fixtures|tests\/integration\/pilot)\/([a-z][a-z0-9-]*\.(?:ts|mjs)):(\d{1,6}):(\d{1,6})/g)].filter(m=>['pilot-environment.ts','plan-eval-environment.ts','check-ordinary-operations-native.ts','check-ordinary-native-files.ts','load-mcp.test.ts','environment.ts','consumer.ts','build-check.mjs'].includes(m[1])).map(m=>({file:m[0].split(':')[0],line:Number(m[2]),column:Number(m[3])})).map(x=>JSON.stringify(x)))].slice(0,5).map(x=>JSON.parse(x));
 return {code:typeof raw.code==='number'&&Number.isInteger(raw.code)&&raw.code>=0&&raw.code<=255?raw.code:null,signal:['SIGTERM','SIGKILL','SIGABRT','SIGSEGV'].includes(String(raw.signal))?raw.signal:null,deadlineExpired:raw.deadlineExpired===true,signatures,locations};
}
