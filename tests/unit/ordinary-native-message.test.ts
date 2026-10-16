import {nativeProviderFilePresent} from '../../lib/server/conversations/native-provider-dedup';
import {createHash} from 'node:crypto';
import {formatAttachmentText} from '../../lib/conversations/attachment-text';
import {describe,expect,it} from 'vitest';
import {parseOrdinaryNativeMessage,nativeMessageDigest,summarizeNativeMessage,nativeUploadTransportMessage,matchesNativeUploadTransport,canonicalNativeUploadTransport} from '../../lib/server/conversations/native-message';
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

it('keeps staged bytes outside durable native streams without losing mixed inline parts or original digest',()=>{
 const staged={type:'file',filename:'large.png',mediaType:'image/png',data:'turas-upload:00000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64),size:10*1024*1024};
 const original=parseOrdinaryNativeMessage([{type:'text',text:'Original prompt'},staged]);
 const summary=nativeUploadTransportMessage(original);
 expect(summary).toBe(summarizeNativeMessage(original));expect(JSON.stringify(summary).length).toBeLessThan(1024);
 expect(matchesNativeUploadTransport(original,summary,nativeMessageDigest(original))).toBe(true);
 expect(matchesNativeUploadTransport(original,String(summary)+' changed',nativeMessageDigest(original))).toBe(false);
 const mixed=parseOrdinaryNativeMessage([{type:'text',text:'Original prompt'},file('inline'),staged]);
 const forwarded=nativeUploadTransportMessage(mixed);expect(Array.isArray(forwarded)).toBe(true);
 if(typeof forwarded==='string')throw Error('Mixed transport lost inline file');
 expect(forwarded.filter(part=>part.type==='file')).toEqual([file('inline')]);
 expect(summarizeNativeMessage(forwarded)).toBe(summarizeNativeMessage(mixed));
 expect(matchesNativeUploadTransport(mixed,forwarded,nativeMessageDigest(mixed))).toBe(true);
 expect(matchesNativeUploadTransport(mixed,summarizeNativeMessage(mixed),nativeMessageDigest(mixed))).toBe(false);
 expect(matchesNativeUploadTransport(mixed,parseOrdinaryNativeMessage(forwarded.map(part=>part.type==='file'?file('substitution'):part)),nativeMessageDigest(mixed))).toBe(false);
 expect(matchesNativeUploadTransport(mixed,forwarded,'b'.repeat(64))).toBe(false);
});

it.each(['utf8-boundary','document-envelope'])('recognizes only exact saved generated transport without reparsing %s as new user text',kind=>{
 const prompt=kind==='utf8-boundary'?'界'.repeat(5461)+'a':formatAttachmentText('source.txt','text/plain','x'.repeat(120000));
 const staged={type:'file',filename:'界'.repeat(240),mediaType:'application/octet-stream',data:'turas-upload:00000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64),size:1};
 const original=parseOrdinaryNativeMessage([{type:'text',text:prompt},file('inline'),staged]);
 const transport=nativeUploadTransportMessage(original);if(typeof transport==='string')throw Error('Mixed transport lost inline');
 expect(()=>parseOrdinaryNativeMessage(transport,{trustedHydrated:true})).toThrow();
 expect(canonicalNativeUploadTransport(original,transport,nativeMessageDigest(original))).toEqual(transport);
 const eveParsed=transport.map(part=>part.type==='file'?{type:part.type,mediaType:part.mediaType,data:part.data,filename:part.filename}:part);
 expect(canonicalNativeUploadTransport(original,eveParsed,nativeMessageDigest(original))).toEqual(transport);
 expect(canonicalNativeUploadTransport(original,[...transport,{type:'text',text:'untrusted additional text'}],nativeMessageDigest(original))).toBeNull();
});
