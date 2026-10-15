import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {normalizeMemoryCallbackUrls,patchEveMemoryModuleSource} from '../../scripts/eve-memory-context-compat.mjs';
it('preserves native file contents and metadata as supported string data in durable memory callback context',()=>{
 const url=new URL('data:image/png;base64,c3ludGhldGlj'),file={type:'file',mediaType:'image/png',data:url};
 const context={messages:[{role:'user',content:[file]}],turn:{input:[{role:'user',content:[file]}]},session:{auth:{current:{principalId:'owned-principal'}}},memory:{scope:{key:'unchanged-scope'}}};
 const normalized=normalizeMemoryCallbackUrls(context);
 expect(normalized).toEqual({...context,messages:[{role:'user',content:[{...file,data:url.href}]}],turn:{input:[{role:'user',content:[{...file,data:url.href}]}]}});
 expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized);
 expect(file.data).toBe(url);
});
it('keeps unsupported objects and circular context subject to the existing strict validator',()=>{
 const unsupported=new Date('2026-10-15T00:00:00Z');
 expect(normalizeMemoryCallbackUrls(unsupported)).toBe(unsupported);
 const cycle:{self?:unknown}={};cycle.self=cycle;
 expect((normalizeMemoryCallbackUrls(cycle) as typeof cycle).self).toBe(cycle);
});

it('applies idempotently only to the reviewed Eve source and refuses an altered implementation',()=>{
 const source=readFileSync(new URL('../../node_modules/eve/dist/src/context/memory-tools.js',import.meta.url),'utf8');
 const patched=patchEveMemoryModuleSource(source);
 expect(patchEveMemoryModuleSource(patched)).toBe(patched);
 expect(()=>patchEveMemoryModuleSource(patched+'\n/* unknown source change */')).toThrow('differs');
});
