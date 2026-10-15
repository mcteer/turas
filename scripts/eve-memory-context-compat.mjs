import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Eve 0.67.1 passes URL-valued AI SDK file parts to its JSON-only durable
// memory-tool closure. Strings are an equivalent supported ModelMessage data
// representation. Preserve every other type and the existing JSON validation.
/** @param {unknown} value @param {WeakSet<object>} [ancestors] @returns {unknown} */
export function normalizeMemoryCallbackUrls(value,ancestors=new WeakSet()){
 if(value instanceof URL)return value.href;
 if(value===null||typeof value!=='object')return value;
 if(ancestors.has(value))return value;
 const prototype=Object.getPrototypeOf(value);
 if(!Array.isArray(value)&&prototype!==null&&Object.getPrototypeOf(prototype)!==null)return value;
 ancestors.add(value);
 const result=Array.isArray(value)?value.map(entry=>normalizeMemoryCallbackUrls(entry,ancestors)):
  Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,normalizeMemoryCallbackUrls(entry,ancestors)]));
 ancestors.delete(value);return result;
}

export function patchEveMemoryModuleSource(source){
 const original='parseJsonObject({context:e.context,key:e.key})',replacement='parseJsonObject({context:normalizeMemoryCallbackUrls(e.context),key:e.key})';
 const suffix='\n'+normalizeMemoryCallbackUrls.toString()+'\n';
 const digest=value=>createHash('sha256').update(value).digest('hex');
 const expected='bbb31c26a43f494ae6b862ffded17ecec5e70dc6261b41440a6afbe37dfbfa60';
 if(source.endsWith(suffix)&&source.includes(replacement)){
  const restored=source.slice(0,-suffix.length).replace(replacement,original);
  if(digest(restored)!==expected)throw Error('Installed Eve compatibility source changed');
  return source;
 }
 if(digest(source)!==expected||source.split(original).length!==2)throw Error('Installed Eve memory source differs from the reviewed compatibility target');
 return source.replace(original,replacement)+suffix;
}
export function applyEveMemoryContextCompatibility(){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'../node_modules/eve');
 const version=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;
 if(version!=='0.67.1')throw Error('Review Eve memory compatibility before changing the installed framework version');
 const path=resolve(root,'dist/src/context/memory-tools.js'),source=readFileSync(path,'utf8');
 const patched=patchEveMemoryModuleSource(source);
 if(patched!==source)writeFileSync(path,patched);
 return {version,alreadyApplied:patched===source};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(applyEveMemoryContextCompatibility()));
