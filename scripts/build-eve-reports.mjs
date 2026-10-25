import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {lstat,realpath,readdir,readFile,mkdir,writeFile,chmod,readlink} from 'node:fs/promises';
import {resolve,join,relative,dirname,sep} from 'node:path';

// Private function resources, never public assets or a recursive source copy.
const files=[
 'report-templates/assets/vercel-logotype.svg','report-templates/assets/vercel-logotype.png',
 'report-templates/fonts/Geist-Regular.ttf','report-templates/fonts/Geist-Bold.ttf',
 'report-templates/fonts/LICENSE.txt','report-templates/fonts/manifest.json','report-templates/assets/PROVENANCE.md',
 'report-templates/weekly.ts','report-templates/executive.ts','report-templates/brand-manifest.json',
 'report-renderer/layout.ts','report-renderer/render.ts','report-renderer/validate.py',
];
const root=await realpath(process.cwd()),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const requireValue=(value,message)=>{if(!value)throw Error(message)};
const inside=(base,path)=>path.startsWith(base+sep);
async function ordinaryFile(path){const info=await lstat(path);requireValue(info.isFile()&&!info.isSymbolicLink()&&info.size<=10485760&&await realpath(path)===path,'Expected a direct bounded report resource');return readFile(path)}
const source=new Map();for(const file of files)source.set(file,await ordinaryFile(join(root,file)));
const manifest=JSON.parse(source.get('report-templates/brand-manifest.json').toString('utf8'));
requireValue(Array.isArray(manifest.assets)&&manifest.assets.every(asset=>source.has(asset.path)&&hash(source.get(asset.path))===asset.sha256),'Exact authored brand resources required');
const args=process.argv.slice(2);
requireValue(args.length===0||(args.length===1&&args[0]==='--skip-sandbox-prewarm'),'Only the original optional sandbox-prewarm flag is supported');
// withEve supplies these output directories to its separately built service.
// Use the original CLI and its existing build context; no framework hooks are changed.
const output=resolve(root,process.env.EVE_INTERNAL_BUILD_OUTPUT_DIRECTORY??(process.env.VERCEL?'.vercel/output':'.output'));
requireValue(inside(root,output)&&(output.endsWith(`${sep}.vercel${sep}output`)||output===join(root,'.output')),'Expected an owned Eve output directory');
const result=spawnSync(process.execPath,[join(root,'node_modules/eve/bin/eve.js'),'build',...args],{cwd:root,env:process.env,stdio:'inherit'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
requireValue(await realpath(output)===output,'Published Eve output cannot escape through a link');
for(const [file,bytes] of source)requireValue(hash(await ordinaryFile(join(root,file)))===hash(bytes),'Report resources changed during the original build');

const aliases=[],canonical=new Map(),functions=join(output,'functions');
async function visit(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.name.endsWith('.func')){
   const target=await realpath(path),info=await lstat(target);
   requireValue(inside(functions,target)&&target.endsWith('.func')&&info.isDirectory()&&!info.isSymbolicLink(),'Private function alias escapes the published functions');
   const config=JSON.parse((await ordinaryFile(join(target,'.vc-config.json'))).toString('utf8'));
   requireValue(/^nodejs\d+\.x$/.test(config.runtime)&&config.launcherType==='Nodejs'&&typeof config.handler==='string','Only a Node function resource root is supported');
   const handler=resolve(target,config.handler);
   requireValue(inside(target,handler)&&await realpath(handler)===handler&&(await lstat(handler)).isFile(),'Node handler must remain inside its function');
   aliases.push({path:relative(output,path),canonical:relative(output,target)});canonical.set(target,config);
  }else if(entry.isDirectory()){
   requireValue(await realpath(path)===path,'Unexpected linked function directory');await visit(path);
  }else requireValue(!entry.isSymbolicLink(),'Unexpected function output link');
 }
}
if(process.env.VERCEL||process.env.EVE_INTERNAL_BUILD_OUTPUT_DIRECTORY){
 requireValue((await lstat(functions)).isDirectory()&&await realpath(functions)===functions,'Private Vercel functions directory required');await visit(functions);
 requireValue(aliases.length>0&&canonical.size>0,'Original Eve build emitted no Node functions');
}else{
 const server=join(output,'server');requireValue((await lstat(server)).isDirectory()&&await realpath(server)===server,'Original local Eve server required');
 canonical.set(server,null);aliases.push({path:'server',canonical:'server'});
}
async function bundleInventory(){
 const entries=[];
 for(const directory of [...canonical.keys()].sort()){
  const scan=async(path)=>{for(const entry of await readdir(path,{withFileTypes:true})){
   const child=join(path,entry.name),name=relative(directory,child).split(sep).join('/');
   if(files.includes(name))continue;
   if(entry.isDirectory())await scan(child);
   else if(entry.isSymbolicLink())entries.push({path:relative(output,child),link:await readlink(child)});
   else if(entry.isFile())entries.push({path:relative(output,child),digest:hash(await readFile(child))});
   else throw Error('Unexpected function resource');
  }};await scan(directory);
 }
 return entries.sort((a,b)=>a.path.localeCompare(b.path));
}
const before=await bundleInventory();
for(const directory of canonical.keys())for(const [file,bytes] of source){
 const destination=join(directory,file);let parent=dirname(destination);
 const parents=[];while(parent!==directory){parents.unshift(parent);parent=dirname(parent)}
 for(const path of parents){await mkdir(path,{mode:0o755}).catch(error=>{if(error.code!=='EEXIST')throw error});requireValue((await lstat(path)).isDirectory()&&await realpath(path)===path,'Report resource parent is linked or invalid')}
 const existing=await lstat(destination).catch(error=>{if(error.code==='ENOENT')return null;throw error});
 if(existing)requireValue(hash(await ordinaryFile(destination))===hash(bytes),'Original function already contains different report bytes');
 else{await writeFile(destination,bytes,{flag:'wx',mode:0o644});await chmod(destination,0o644)}
 requireValue(hash(await ordinaryFile(destination))===hash(bytes),'Copied report resource digest differs');
}
for(const alias of aliases)for(const [file,bytes] of source){
 const path=join(output,alias.path,file),target=join(output,alias.canonical,file);
 requireValue(await realpath(path)===target&&hash(await ordinaryFile(target))===hash(bytes),'Function alias resource or digest differs');
}
const after=await bundleInventory();requireValue(JSON.stringify(before)===JSON.stringify(after),'Non-resource function bytes or links changed');
const evidenceDirectory=join(root,'.eve/build-profiles');await mkdir(evidenceDirectory,{recursive:true,mode:0o700});requireValue(await realpath(evidenceDirectory)===evidenceDirectory,'Build evidence directory is linked');
const evidence={contract:'eve-private-report-resources-v1',output:relative(root,output),aliases:aliases.sort((a,b)=>a.path.localeCompare(b.path)),canonicalRoots:[...canonical.keys()].map(path=>relative(output,path)).sort(),resources:[...source].map(([path,bytes])=>({path,sizeBytes:bytes.length,digest:hash(bytes)})),nonResourceEntries:before.length,nonResourceBeforeDigest:hash(JSON.stringify(before)),nonResourceAfterDigest:hash(JSON.stringify(after)),publicResourcesAdded:0,originalEveBuildSucceeded:true};
const evidenceFile=join(evidenceDirectory,`report-resources-${randomUUID()}.json`);await writeFile(evidenceFile,JSON.stringify(evidence,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Verified ${files.length} report resources in ${aliases.length} Eve Node function aliases (${canonical.size} distinct roots).`);
console.log(`Report resource evidence: ${relative(root,evidenceFile)}`);
