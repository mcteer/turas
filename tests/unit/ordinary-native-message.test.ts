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
