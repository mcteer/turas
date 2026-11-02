import {readFile,writeFile,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';

/** Configure recovery only in a disposable copied app. Never change the selected
 * development supervisor, its database or its retained workflow world. */
export async function installOwnedEveResume(appRoot:string,feature:'007'|'008'){
 const root=await realpath(appRoot),base=await realpath(resolve('local-artifacts',feature));
 const database=process.env.DATABASE_URL;
 if(!root.startsWith(base+'/eval-')||!root.endsWith('/app')||!database||
  !new RegExp('^/turas_test_'+feature+'_eval_[a-f0-9]{12}$').test(new URL(database).pathname)||
  !process.env.TURAS_ENVIRONMENT_ID?.startsWith('test-')||process.env.TURAS_ENVIRONMENT_ID!==process.env.TURAS_TEST_ENVIRONMENT_ID||
  !process.env.TURAS_TEST_DATABASE_URL||new URL(database).pathname!==new URL(process.env.TURAS_TEST_DATABASE_URL).pathname||
  process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN||process.env.TURAS_ALLOW_LIVE_MODEL_TESTS==='1')throw Error('Owned unpaid recovery runtime required');
 const path=join(root,'scripts/dev.mjs');let source=await readFile(path,'utf8');
 if(source.split('const next = spawn(').length!==2||source.split('  next.kill("SIGTERM");').length!==2||source.includes('const ownedEve='))throw Error('Owned recovery supervisor shape changed');
 const custodyFile=join(base,'owned-eve-resume-worlds-private.jsonl');
 const launcher=`import {appendFileSync,readdirSync,readFileSync} from 'node:fs';
const ownedEve=spawn(resolve(cwd,'node_modules/.bin/eve'),['dev','--resume','--no-ui','--port','0'],{cwd,env:process.env,stdio:['ignore','pipe','pipe']});
let ownedOrigin='';
await new Promise((done,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Owned resume server timeout')),90000);const listen=chunk=>{const value=chunk.toString();process.stdout.write(value);text=(text+value).slice(-200000);const match=text.match(/server listening at (http:\\/\\/127\\.0\\.0\\.1:\\d+)\\//);if(match){ownedOrigin=match[1];clearTimeout(timer);done();}};ownedEve.stdout.on('data',listen);ownedEve.stderr.on('data',listen);ownedEve.once('exit',()=>{clearTimeout(timer);reject(Error('Owned resume server exited'));});});
try{const generations=readdirSync(resolve(cwd,'.eve/dev-hosts'),{withFileTypes:true}).filter(entry=>entry.isDirectory()&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(entry.name)).map(entry=>entry.name);const sandboxRunIds=readdirSync(resolve(cwd,'.eve')).filter(name=>/^dev-cleanup-intent\\.[a-f0-9-]{36}\\.json$/.test(name)).flatMap(name=>{const value=JSON.parse(readFileSync(resolve(cwd,'.eve',name),'utf8')).runId;return typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value)?[value]:[];});appendFileSync(${JSON.stringify(custodyFile)},JSON.stringify({appRoot:cwd,generations,sandboxRunIds})+'\\n',{mode:0o600});}catch{process.stderr.write('Owned recovery resource custody unavailable\\n');}
`;
 source=source.replace('const next = spawn(',launcher+'const next = spawn(').replace('["dev"]','["dev","--webpack"]').replace('  next.kill("SIGTERM");','  next.kill("SIGTERM");\n  ownedEve.kill("SIGTERM");');
 source+='\nconsume("server listening at "+ownedOrigin+"/");\n';
 await writeFile(path,source,{mode:0o600});
}
