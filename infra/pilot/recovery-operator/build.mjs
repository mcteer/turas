import {mkdir,readFile,writeFile,cp,lstat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
const root=resolve('.'),source=JSON.parse(await readFile(join(root,'src/source.json'),'utf8'));
const runtime=await readFile(join(root,'src/runtime.cjs'));
if(createHash('sha256').update(runtime).digest('hex')!==source.runtimeDigest)throw Error('Prepared operator runtime differs');
const assets=join(root,'src/native-client'),manifestBytes=await readFile(join(assets,'manifest.json')),manifest=JSON.parse(manifestBytes.toString());
if(createHash('sha256').update(manifestBytes).digest('hex')!==source.nativeManifestDigest||manifest.contract!=='pilot-native-client-v2'||manifest.files.length!==10)throw Error('Prepared operator tools differ');
const expected=new Set(['manifest.json',...manifest.files.map(file=>file.path)]);
async function verify(relative=''){
 const path=join(assets,relative),info=await lstat(path);if(info.isSymbolicLink())throw Error('Operator tool symlink rejected');
 if(info.isDirectory()){for(const name of await readdir(path))await verify(relative?relative+'/'+name:name);return;}
 if(!info.isFile()||!expected.delete(relative))throw Error('Unlisted operator tool');
 const row=manifest.files.find(file=>file.path===relative);if(row&&(info.size!==row.bytes||createHash('sha256').update(await readFile(path)).digest('hex')!==row.digest))throw Error('Operator tool bytes differ');
}
await verify();if(expected.size)throw Error('Operator tool inventory incomplete');
const output=join(root,'.vercel/output'),func=join(output,'functions/api/backup.func');await mkdir(func,{recursive:true});
await writeFile(join(func,'runtime.cjs'),runtime);await writeFile(join(func,'source.json'),JSON.stringify(source));await cp(assets,join(func,'native-client'),{recursive:true,errorOnExist:true,force:false});
await writeFile(join(func,'.vc-config.json'),JSON.stringify({runtime:'nodejs24.x',handler:'runtime.cjs',memory:2048,maxDuration:300,regions:['iad1']}));
await writeFile(join(output,'config.json'),JSON.stringify({version:3,routes:[{handle:'filesystem'},{src:'^.*$',status:404}],crons:[{path:'/api/backup',schedule:'0 */12 * * *'}]}));
