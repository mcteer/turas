import {Client} from 'pg';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {transitionRecoveryControl,type RecoveryControlCommand} from '../lib/server/operations/control';
export function operatorRecoveryDatabase(environmentId:string,env:NodeJS.ProcessEnv=process.env){
 const raw=env.DATABASE_URL_UNPOOLED;if(!raw||!environmentId||env.TURAS_ENVIRONMENT_ID!==environmentId)throw Error('Explicit recovery owner and target identity required');
 const url=new URL(raw);if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Recovery database transport unavailable');
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(local){if(env.TURAS_PILOT_OWNED!=='1'||env.TURAS_TEST_ENVIRONMENT_ID!==environmentId||!/^\/turas_test_016_eval_[a-f0-9]{12}$/.test(url.pathname))throw Error('Unowned local recovery target');}
 else if(url.searchParams.get('sslmode')!=='verify-full')throw Error('Recovery database requires verify-full transport');
 return raw;
}
export async function pilotControl(args=process.argv.slice(2)){
 const allowed=new Set(['environment','mode','expected-revision','recovery-id','operation-id','verified-bundle-digest']),values:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){const key=args[i].replace(/^--/,'');if(!args[i].startsWith('--')||!allowed.has(key)||values[key]||!args[i+1]||args[i+1].startsWith('--'))throw Error('Invalid explicit recovery command');values[key]=args[i+1];}
 const environmentId=values.environment;if(!environmentId)throw Error('Explicit recovery target required');
 const db=new Client({connectionString:operatorRecoveryDatabase(environmentId),connectionTimeoutMillis:5000});await db.connect();
 try{
  if(values.mode==='status'){
   if(Object.keys(values).length!==2)throw Error('Status does not accept mutation inputs');
   const row=(await db.query('SELECT mode,revision,recovery_id FROM operations_control WHERE environment_id=$1',[environmentId])).rows[0];if(!row)throw Error('Recovery target unavailable');console.info(JSON.stringify({mode:row.mode,revision:Number(row.revision),recoveryId:row.recovery_id}));return;
  }
  const command={environmentId,mode:values.mode,expectedRevision:Number(values['expected-revision']),recoveryId:values['recovery-id'],operationId:values['operation-id'],...(values['verified-bundle-digest']?{verifiedBundleDigest:values['verified-bundle-digest']}:{})} as RecoveryControlCommand;
  console.info(JSON.stringify(await transitionRecoveryControl(db,command)));
 }finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)pilotControl().catch(()=>{console.error('Recovery control failed; current fence retained.');process.exitCode=1;});
