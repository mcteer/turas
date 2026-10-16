import {nativeProviderFilePresent} from '../../lib/server/conversations/native-provider-dedup';
import {createHash} from 'node:crypto';
import {formatAttachmentText} from '../../lib/conversations/attachment-text';
import {describe,expect,it} from 'vitest';
import {parseOrdinaryNativeMessage,nativeMessageDigest,summarizeNativeMessage} from '../../lib/server/conversations/native-message';
const file=(text:string)=>({type:'file',filename:'source.bin',mediaType:'application/octet-stream',data:'data:application/octet-stream;base64,'+Buffer.from(text).toString('base64')});
describe('legacy native file transport',()=>{
 it('binds actual bytes and metadata while keeping Eve’s original received-message summary',()=>{
  const a=parseOrdinaryNativeMessage([{type:'text',text:'Read this file.\r\n'},file('one')]);
  const b=parseOrdinaryNativeMessage([{type:'text',text:'Read this file.\n'},file('two')]);
  expect(summarizeNativeMessage(a)).toBe('Read this file.\n\n[file: source.bin (application/octet-stream)]');
  expect(nativeMessageDigest(a)).not.toBe(nativeMessageDigest(b));
  expect(nativeMessageDigest(a)).toBe(nativeMessageDigest(parseOrdinaryNativeMessage(a)));
 });
 it('keeps ordinary prompt and combined document limits when files use native transport',()=>{
  expect(()=>parseOrdinaryNativeMessage([{type:'text',text:'界'.repeat(5462)},file('one')])).toThrow();
  const docs=Array.from({length:5},(_,i)=>formatAttachmentText(`source-${i}.txt`,'text/plain','Unverified supplied context.')).join('\n');
  expect(()=>parseOrdinaryNativeMessage([{type:'text',text:docs},file('one')])).toThrow();
  expect(()=>parseOrdinaryNativeMessage([{...file('one'),filename:'bad\nname.bin'}])).toThrow();
  expect(()=>parseOrdinaryNativeMessage([{...file('one'),data:'data:application/octet-stream;base64,AB=='}])).toThrow();
 });
 it('rejects remote references, disguised MIME types, malformed bytes and excessive file batches',()=>{
  for(const input of [[{...file('one'),data:'https://private.invalid/source'}],[{...file('one'),mediaType:'image/png'}],
   [{...file('one'),data:'data:application/octet-stream;base64,eA==AAAA'}],Array.from({length:6},()=>file('one'))])
   expect(()=>parseOrdinaryNativeMessage(input)).toThrow();
 });
});

it('deduplicates exact SDK staging aliases only with original immutable name, MIME and actual bytes',()=>{
 const bytes=Buffer.from('owned original bytes'),sha256=createHash('sha256').update(bytes).digest('hex'),identity={filename:'original.png',mediaType:'image/png',sha256};
 const part={type:'file',filename:`/workspace/attachments/${sha256.slice(0,16)}/original.png`,mediaType:'image/png',data:{type:'data',data:bytes}};
 expect(nativeProviderFilePresent(identity,[part])).toBe(true);
 expect(nativeProviderFilePresent(identity,[{...part,filename:'original.png'}])).toBe(true);
 for(const changed of [{...part,filename:`/workspace/attachments/${sha256.slice(0,16)}/corrected.png`},{...part,filename:'/arbitrary/original.png'},{...part,mediaType:'text/plain'},{...part,data:{type:'data',data:Buffer.from('changed')}},{...part,data:{type:'url',url:'file:///workspace/attachments/original.png'}}])expect(nativeProviderFilePresent(identity,[changed])).toBe(false);
 expect(nativeProviderFilePresent({...identity,filename:'corrected.png'},[part])).toBe(false);
});
