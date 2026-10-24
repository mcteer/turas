import {Client} from 'pg';
import {writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';

const operations=['input-binding','advisory-lock','membership','principal','login-session','workspace','operations-control','conversation-lock','continuation-authority','input-window','attempt-update','watchdog-update','commit','other'] as const;
const waits=['none','Lock','LWLock','IO','BufferPin','Client','IPC','Timeout','Activity','Extension','other'] as const;
export function nativeQueryOperation(value:unknown):typeof operations[number]{
 const sql=typeof value==='string'?value.slice(0,4096).replace(/\s+/g,' ').trim():'';
 if(sql.startsWith('SELECT DISTINCT c.id AS conversation_id,request,'))return 'input-binding';
 if(/^SELECT pg_advisory_(?:xact_)?lock/.test(sql))return 'advisory-lock';
 if(/^SELECT .* FROM memberships\b/.test(sql))return 'membership';
 if(/^SELECT .* FROM principals\b/.test(sql))return 'principal';
 if(/^SELECT .* FROM login_sessions\b/.test(sql))return 'login-session';
 if(/^SELECT .* FROM workspaces\b/.test(sql))return 'workspace';
 if(/^SELECT .* FROM operations_control\b/.test(sql))return 'operations-control';
 if(sql.includes('FOR UPDATE OF c')&&sql.includes('FROM conversations c'))return 'conversation-lock';
 if(sql.startsWith('INSERT INTO ordinary_continuation_authorities'))return 'continuation-authority';
 if(sql.startsWith('INSERT INTO native_input_resume_windows'))return 'input-window';
 if(sql.startsWith('UPDATE response_attempts'))return 'attempt-update';
 if(sql.startsWith('UPDATE watchdog_jobs'))return 'watchdog-update';
 return sql==='COMMIT'?'commit':'other';
}
const states=['active','idle','idle in transaction','idle in transaction (aborted)','other'] as const;
const blockerEntry=z.strictObject({operation:z.enum(operations),state:z.enum(states),wait:z.enum(waits),samples:z.number().int().min(1).max(200000),maximumQueryElapsedMs:z.number().int().min(0).max(600000),maximumTransactionElapsedMs:z.number().int().min(0).max(600000),blockerOperations:z.array(z.enum(operations)).max(operations.length)});
/** Return only fixed blocker classes and bounded durations, never backend IDs,
 * SQL, application names, customer data or timestamps. */
export function nativeBlockerMetadata(value:unknown,chain:readonly unknown[]=[]){
 const row=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const age=(v:unknown)=>typeof v==='number'||typeof v==='string'?Math.max(0,Math.min(600000,Math.round(Number(v)||0))):0;
 return {operation:nativeQueryOperation(row.query),state:states.includes(row.state as typeof states[number])?row.state as typeof states[number]:'other' as const,wait:row.wait_event_type===null?'none' as const:waits.includes(row.wait_event_type as typeof waits[number])?row.wait_event_type as typeof waits[number]:'other' as const,queryElapsedMs:age(row.elapsed_ms),transactionElapsedMs:age(row.transaction_elapsed_ms),blockerOperations:[...new Set(chain.map(nativeQueryOperation))].sort()};
}
const entry=z.strictObject({operation:z.enum(operations),wait:z.enum(waits),samples:z.number().int().min(1).max(200000),maximumElapsedMs:z.number().int().min(0).max(600000),blockedSamples:z.number().int().min(0).max(200000),blockerOperations:z.array(z.enum(operations)).max(operations.length),blockerDetails:z.array(blockerEntry).max(8).optional(),blockerDetailsTruncated:z.boolean().optional()});
export const nativeQueryObservationSchema=z.strictObject({contract:z.literal('owned-native-query-observation-v1'),instrumented:z.literal(true),state:z.enum(['observed','unavailable']),samples:z.number().int().min(0).max(1200),rowsTruncated:z.boolean(),observations:z.array(entry).max(operations.length*waits.length)});

/** Diagnostic only: one read-only connection to the parent's owned server.
 * Its derived disposable clones contain the native exercise; no SQL, parameters,
 * database names, process IDs or arbitrary errors leave this process. */
export async function observeNativeQueries(){
 process.umask(0o077);
 const url=new URL(process.env.TURAS_NATIVE_OBSERVER_URL??''),file=resolve(process.env.TURAS_NATIVE_OBSERVER_FILE??''),parent=Number(process.env.TURAS_NATIVE_OBSERVER_PARENT);
 if(url.hostname!=='127.0.0.1'||url.pathname!=='/turas_test_parity'||decodeURIComponent(url.username)!=='postgres'||!file.startsWith(resolve('local-artifacts/018/ci-disposable')+'/')||!Number.isSafeInteger(parent)||parent<1)throw Error('Exact owned observer scope required');
 const db=new Client({connectionString:url.href,connectionTimeoutMillis:1500,statement_timeout:1000,query_timeout:1500,application_name:'owned-native-query-observer'});
 let stopped=false,samples=0,truncated=false,available=true,blockerDetails=0;const records=new Map<string,z.infer<typeof entry>>(),deadline=Date.now()+600000;
 const stop=()=>{stopped=true;};process.once('SIGTERM',stop);process.once('SIGINT',stop);
 const persist=async()=>{const receipt=nativeQueryObservationSchema.parse({contract:'owned-native-query-observation-v1',instrumented:true,state:available?'observed':'unavailable',samples,rowsTruncated:truncated,observations:[...records.values()]});const bytes=JSON.stringify(receipt);if(Buffer.byteLength(bytes)>65536)throw Error('Diagnostic bound exceeded');await writeFile(file+'.tmp',bytes,{mode:0o600});await rename(file+'.tmp',file);};
 try{
  await db.connect();
  const marker=(await db.query('SELECT environment_id FROM turas_environment')).rows;
  if(marker.length!==1||marker[0].environment_id!=='test-parity-disposable')throw Error('Owned observer marker differs');
  while(!stopped&&Date.now()<deadline&&samples<1200){
   if(process.ppid!==parent)break;
   try{process.kill(parent,0);}catch{break;}
   // Only clones created by this owned-server fixture are eligible. Runtime
   // roles cannot create databases; the source database is independently bound.
   const rows=(await db.query(`SELECT pid,state,wait_event_type,query,pg_blocking_pids(pid) AS blockers,
    GREATEST(0,extract(epoch FROM(clock_timestamp()-query_start))*1000) AS elapsed_ms,
    CASE WHEN xact_start IS NULL THEN 0 ELSE GREATEST(0,extract(epoch FROM(clock_timestamp()-xact_start))*1000) END AS transaction_elapsed_ms
    FROM pg_stat_activity WHERE backend_type='client backend'
     AND datname ~ '^turas_test_[0-9]{3}_eval_[a-f0-9]{12}$'
     AND pid<>pg_backend_pid() ORDER BY pid LIMIT 129`)).rows;
   samples++;truncated ||= rows.length>128;const selected=rows.slice(0,128);
   for(const row of selected){if(row.state!=='active'||Number(row.elapsed_ms)<100)continue;
    const operation=nativeQueryOperation(row.query),wait=waits.includes(row.wait_event_type)?row.wait_event_type as typeof waits[number]:row.wait_event_type===null?'none':'other',key=operation+':'+wait;
    const record=records.get(key)??{operation,wait,samples:0,maximumElapsedMs:0,blockedSamples:0,blockerOperations:[],blockerDetails:[],blockerDetailsTruncated:false};record.samples++;record.maximumElapsedMs=Math.max(record.maximumElapsedMs,Math.min(600000,Math.round(Number(row.elapsed_ms))));
    if(Array.isArray(row.blockers)&&row.blockers.length){
     record.blockedSamples++;const found=selected.filter(value=>row.blockers.includes(value.pid)),seen=new Set<string>();
     if(found.length!==row.blockers.length)record.blockerDetailsTruncated=true;
     for(const blocker of found){
      const chain=selected.filter(value=>Array.isArray(blocker.blockers)&&blocker.blockers.includes(value.pid)).map(value=>value.query),detail=nativeBlockerMetadata(blocker,chain),kind=detail.operation;
      if(!record.blockerOperations.includes(kind))record.blockerOperations.push(kind);
      const key=JSON.stringify([detail.operation,detail.state,detail.wait,detail.blockerOperations]);if(seen.has(key))continue;seen.add(key);
      const details=record.blockerDetails??=[];let observed=details.find(value=>JSON.stringify([value.operation,value.state,value.wait,value.blockerOperations])===key);
      if(!observed){if(details.length>=8||blockerDetails>=64){record.blockerDetailsTruncated=true;continue;}observed={operation:detail.operation,state:detail.state,wait:detail.wait,blockerOperations:detail.blockerOperations,samples:0,maximumQueryElapsedMs:0,maximumTransactionElapsedMs:0};details.push(observed);blockerDetails++;}
      observed.samples=Math.min(200000,observed.samples+1);observed.maximumQueryElapsedMs=Math.max(observed.maximumQueryElapsedMs,detail.queryElapsedMs);observed.maximumTransactionElapsedMs=Math.max(observed.maximumTransactionElapsedMs,detail.transactionElapsedMs);
     }
    }
    records.set(key,record);
   }
   if(samples%10===0)await persist();
   await new Promise(done=>setTimeout(done,500));
  }
 }catch{available=false;}
 finally{await db.end().catch(()=>undefined);await persist();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)observeNativeQueries().catch(()=>{process.exitCode=1;});
