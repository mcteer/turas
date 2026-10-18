import {it,expect} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execute=promisify(execFile),script=resolve('scripts/start-ui-production.mjs');
const configuration='TURAS_ENVIRONMENT_ID=test-ui-supervisor\nTURAS_APP_ORIGIN=http://127.0.0.1:29999\n'+
 'DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/turas_test_supervisor\n'+
 'DATABASE_URL_UNPOOLED=postgresql://synthetic:synthetic@127.0.0.1:1/turas_test_supervisor\n';
async function inspect(files:Record<string,string>,override:Record<string,string>={}){
 const root=await mkdtemp(join(tmpdir(),'turas-ui-supervisor-'));
 try{
  for(const [name,value] of Object.entries(files))await writeFile(join(root,name),value,{mode:0o600});
  try{await execute(process.execPath,[script],{cwd:root,env:{PATH:process.env.PATH,HOME:process.env.HOME,
   NODE_ENV:'test',CI:'true',TURAS_UI_PRODUCTION:'1',...override},timeout:10000,maxBuffer:65536});throw Error('Supervisor unexpectedly started');}
  catch(error){const result=error as Error&{stderr?:string;stdout?:string};return (result.stderr??'')+(result.stdout??'')+result.message;}
 }finally{await rm(root,{recursive:true,force:true});}
}

it('checks production dotenv precedence before allowing a database target',async()=>{
 for(const url of ['postgresql://synthetic:synthetic@private.neon.tech/turas_test_supervisor','private:synthetic-private-value@bad[']){
  const text=await inspect({'.env.local':configuration,'.env.production.local':`DATABASE_URL=${url}\n`});
  expect(text).toContain('Owned local UI database required');expect(text).not.toContain(url);
 }
});

it('rejects a file-loaded provider credential before any service starts without printing its value',async()=>{
 const text=await inspect({'.env.local':configuration+'AI_GATEWAY_API_KEY=synthetic-private-provider-value\n'});
 expect(text).toContain('Unpaid UI environment required');expect(text).not.toContain('synthetic-private-provider-value');
});

it('allows explicit safe shell configuration to override dotenv and reaches the build prerequisite',async()=>{
 const text=await inspect({'.env.local':configuration+'AI_GATEWAY_API_KEY=synthetic-private-provider-value\n'}, {AI_GATEWAY_API_KEY:''});
 expect(text).toContain('Build the current Next and Eve application before UI checks');
 expect(text).not.toContain('synthetic-private-provider-value');
});
