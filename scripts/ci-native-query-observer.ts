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
const entry=z.strictObject({operation:z.enum(operations),wait:z.enum(waits),samples:z.number().int().min(1).max(200000),maximumElapsedMs:z.number().int().min(0).max(600000),blockedSamples:z.number().int().min(0).max(200000),blockerOperations:z.array(z.enum(operations)).max(operations.length)});
export const nativeQueryObservationSchema=z.strictObject({contract:z.literal('owned-native-query-observation-v1'),instrumented:z.literal(true),state:z.enum(['observed','unavailable']),samples:z.number().int().min(0).max(1200),rowsTruncated:z.boolean(),observations:z.array(entry).max(operations.length*waits.length)});

/** Diagnostic only: one read-only connection to the parent's owned server.
 * Its derived disposable clones contain the native exercise; no SQL, parameters,
 * database names, process IDs or arbitrary errors leave this process. */
export async function observeNativeQueries(){
 process.umask(0o077);
 const url=new URL(process.env.TURAS_NATIVE_OBSERVER_URL??''),file=resolve(process.env.TURAS_NATIVE_OBSERVER_FILE??''),parent=Number(process.env.TURAS_NATIVE_OBSERVER_PARENT);
 if(url.hostname!=='127.0.0.1'||url.pathname!=='/turas_test_parity'||decodeURIComponent(url.username)!=='postgres'||!file.startsWith(resolve('local-artifacts/018/ci-disposable')+'/')||!Number.isSafeInteger(parent)||parent<1)throw Error('Exact owned observer scope required');
 const db=new Client({connectionString:url.href,connectionTimeoutMillis:1500,statement_timeout:1000,query_timeout:1500,application_name:'owned-native-query-observer'});
 let stopped=false,samples=0,truncated=false,available=true;const records=new Map<string,z.infer<typeof entry>>(),deadline=Date.now()+600000;
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
    GREATEST(0,extract(epoch FROM(clock_timestamp()-query_start))*1000) AS elapsed_ms
    FROM pg_stat_activity WHERE backend_type='client backend'
     AND datname ~ '^turas_test_[0-9]{3}_eval_[a-f0-9]{12}$'
     AND pid<>pg_backend_pid() ORDER BY pid LIMIT 129`)).rows;
   samples++;truncated ||= rows.length>128;const selected=rows.slice(0,128);
   for(const row of selected){if(row.state!=='active'||Number(row.elapsed_ms)<100)continue;
    const operation=nativeQueryOperation(row.query),wait=waits.includes(row.wait_event_type)?row.wait_event_type as typeof waits[number]:row.wait_event_type===null?'none':'other',key=operation+':'+wait;
    const record=records.get(key)??{operation,wait,samples:0,maximumElapsedMs:0,blockedSamples:0,blockerOperations:[]};record.samples++;record.maximumElapsedMs=Math.max(record.maximumElapsedMs,Math.min(600000,Math.round(Number(row.elapsed_ms))));
    if(Array.isArray(row.blockers)&&row.blockers.length){record.blockedSamples++;for(const blocker of selected.filter(value=>row.blockers.includes(value.pid))){const kind=nativeQueryOperation(blocker.query);if(!record.blockerOperations.includes(kind))record.blockerOperations.push(kind);}}
    records.set(key,record);
   }
   if(samples%10===0)await persist();
   await new Promise(done=>setTimeout(done,500));
  }
 }catch{available=false;}
 finally{await db.end().catch(()=>undefined);await persist();process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)observeNativeQueries().catch(()=>{process.exitCode=1;});
