import {parseOffice} from 'officeparser';
import {extractText} from './text.ts';
import type {Parsed} from './types.ts';

/** Legacy's officeparser text conversion, inside the existing network-isolated
 * parser. Lines locate the extracted text, never fictional pages or cells. */
export async function extractLegacyDocument(bytes:Uint8Array,format:'html'|'rtf'|'epub'|'odt'|'ods'|'odp'|'odg'):Promise<Parsed>{
 const ast=await parseOffice(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer,{
  fileType:format,extractAttachments:false,ocr:false,
  decompressionLimits:{maxUncompressedBytes:100*1024*1024,maxZipEntries:2000,maxTableCells:50000},
 });
 const text=(await ast.to('text')).value.replace(/\u0000/g,'').trim();
 const points=Array.from(text),bounded=points.slice(0,120000).join('');
 const parsed=extractText(bounded,'txt');
 for(const item of parsed.units)item.locator={...item.locator,kind:'document_text'};
 if(points.length>120000)parsed.coverage.omitted.push({kind:'character',count:points.length-120000,reason:'Legacy extracted-text limit'});
 // Preserve parser-reported limits instead of presenting partial extraction as complete.
 for(const warning of ast.warnings??[]){
  const code=warning.code;
  if(/LIMIT|TRUNCAT/i.test(code))parsed.coverage.omitted.push({kind:'document',count:1,reason:'Parser coverage limit'});
 }
 return parsed;
}
