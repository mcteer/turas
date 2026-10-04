import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const roots=['lib','app','scripts','migrations','report-renderer','report-templates','tests','specs/009-weekly-executive-reporting/contracts'];
const files=['package.json','package-lock.json','agent/agent.ts','next.config.ts','tsconfig.json','vitest.config.ts','playwright.config.ts','specs/009-weekly-executive-reporting/spec.md','specs/009-weekly-executive-reporting/plan.md','.specify/memory/constitution.md'];
export async function reportsSourceManifest(){
 const selected=new Set(files);
 async function walk(root:string){let entries;try{entries=await readdir(root,{withFileTypes:true});}catch(error){if((error as {code?:string}).code==='ENOENT')return;throw error;}
  for(const entry of entries){if(['node_modules','.next','.eve','.DS_Store','__pycache__'].includes(entry.name))continue;const path=join(root,entry.name);if(entry.isDirectory())await walk(path);else if(entry.isFile())selected.add(path);}
 }
 for(const root of roots)await walk(root);
 for(const kind of ['unit','contracts','integration','ui'])for(const name of await readdir(`tests/${kind}`))if(name.startsWith('report-'))selected.add(`tests/${kind}/${name}`);
 for(const name of await readdir('scripts'))if(/^(?:reports?-|check-reports?)/.test(name))selected.add(`scripts/${name}`);
  const digest=createHash('sha256'),manifest:Record<string,string>={};
  for(const file of [...selected].sort()){const bytes=await readFile(file);digest.update(file).update('\0').update(bytes).update('\0');manifest[file]=createHash('sha256').update(bytes).digest('hex');}
  return {digest:digest.digest('hex'),files:manifest};
}
export async function reportsSourceDigest(){return (await reportsSourceManifest()).digest;}
