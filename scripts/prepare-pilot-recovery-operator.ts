import {CURRENT_SCHEMA_VERSION} from '../lib/contracts/current-schema';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile,readFile,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {pilotSource} from './pilot-source';
import {createEvidenceDirectory,writeEvidence} from './pilot-evidence';
import {verifyNativePostgresClient} from '../lib/server/operations/native-postgres';
import {recoveryDigest} from '../lib/contracts/pilot-recovery';

/** Produces a separate deployable package inside the ignored core artifact
 * directory. Never links the primary checkout or copies its private files. */
export async function preparePilotRecoveryOperator(args=process.argv.slice(2)){
 if(args.length!==2||args[0]!=='--output'||Number(process.versions.node.split('.')[0])!==24)throw Error('Node 24 and a fresh explicit operator output required');
 const root=resolve(args[1]);if(!root.startsWith(resolve('local-artifacts/016')+'/'))throw Error('Operator preparation remains inside the core artifact directory');
 const source=await pilotSource(),client=await verifyNativePostgresClient(resolve('infra/pilot/native-postgres/linux-amd64'));
 await createEvidenceDirectory(root);await mkdir(join(root,'src'),{mode:0o700});
 // Deployment source is an allowlist, including after link/env-pull adds local
 // operator credentials. Never rely on Vercel's limited default env exclusions.
 await writeFile(join(root,'.vercelignore'),[
  '*','!/.vercelignore','!/package.json','!/package-lock.json','!/vercel.json','!/build.mjs',
  '!/agent','!/agent/agent.ts','!/agent/instructions.md','!/agent/channels','!/agent/channels/eve.ts',
  '!/src','!/src/runtime.cjs','!/src/source.json','!/src/native-client','!/src/native-client/**',
  '**/.env*','**/*private*','**/credentials*','',
 ].join('\n'),{mode:0o600,flag:'wx'});
 await promisify(execFile)(resolve('node_modules/esbuild/bin/esbuild'),['infra/pilot/recovery-operator/handler.ts','--bundle','--platform=node','--format=cjs','--target=node24','--external:pg-native','--outfile='+join(root,'src/runtime.cjs')],{timeout:60000,maxBuffer:1048576});
 const runtimeDigest=createHash('sha256').update(await readFile(join(root,'src/runtime.cjs'))).digest('hex');
 const manifest=JSON.parse(await readFile('migrations/manifest.json','utf8'));
 if(manifest.version!==CURRENT_SCHEMA_VERSION||manifest.migrations.length!==CURRENT_SCHEMA_VERSION)throw Error('Exact current operator migration ledger required');
 const ledger=manifest.migrations.map((row:{file:string})=>({name:row.file.replace(/\.cjs$/,'')})).sort((a:{name:string},b:{name:string})=>a.name.localeCompare(b.name));
 const metadata={contract:'pilot-recovery-operator-build-v1',source:{...source,ledgerDigest:recoveryDigest(ledger)},runtimeDigest,nativeManifestDigest:client.manifestDigest};
 await writeFile(join(root,'src/source.json'),JSON.stringify(metadata),{mode:0o600,flag:'wx'});
 await cp(client.root,join(root,'src/native-client'),{recursive:true,errorOnExist:true,force:false});
 await cp('infra/pilot/recovery-operator/build.mjs',join(root,'build.mjs'),{errorOnExist:true,force:false});
 await mkdir(join(root,'agent/channels'),{recursive:true,mode:0o700});
 await cp('infra/pilot/recovery-operator/agent.ts',join(root,'agent/agent.ts'),{errorOnExist:true,force:false});
 await writeFile(join(root,'agent/instructions.md'),'This independent work recovery package exposes only a deterministic protected backup Function. No conversational transport or model invocation is published.\n',{mode:0o600,flag:'wx'});
 await writeFile(join(root,'agent/channels/eve.ts'),'import {eveChannel} from "eve/channels/eve";\nexport default eveChannel({auth:[]});\n',{mode:0o600,flag:'wx'});
 await writeFile(join(root,'package.json'),JSON.stringify({name:'turas-recovery-operator',private:true,type:'module',engines:{node:'24.x'},scripts:{build:'node build.mjs'},dependencies:{eve:'0.91.0'}}),{mode:0o600,flag:'wx'});
 await writeFile(join(root,'vercel.json'),JSON.stringify({buildCommand:'npm run build',installCommand:'npm install --ignore-scripts'}),{mode:0o600,flag:'wx'});
 if(JSON.stringify(await pilotSource())!==JSON.stringify(source))throw Error('Operator preparation source changed');
 await promisify(execFile)(process.execPath,['build.mjs'],{cwd:root,timeout:30000,maxBuffer:1048576});
 await writeEvidence(root,'preparation.json',{...metadata,operatorPackageBuilt:true,providerDeployed:false,scheduledInvocationVerified:false,restorationReady:false});
 console.info(JSON.stringify({operatorPackageBuilt:true,providerDeployed:false,restorationReady:false}));return root;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)preparePilotRecoveryOperator().catch(()=>{console.error('Operator preparation failed; no provider deployment performed.');process.exitCode=1;});
