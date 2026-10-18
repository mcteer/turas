import{describe,it,expect}from'vitest';
import{createHash}from'node:crypto';
import{checkedDocumentRetainsClaim}from'../../lib/server/research/ingest';
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
describe('checked research quotation retention',()=>{
 it('keeps late curated products when a fresh check returns the same full document',()=>{
  const lead='Cedar Security public company report. '+('Background context. '.repeat(250));
  const quote='Cedar Security describes its Vercel Sandbox and AI SDK integration for agent credentials.';
  const document=lead+quote,prior={passage:quote,passage_digest:sha(quote),rationale:JSON.stringify({normalizedDigest:sha(document)})};
  expect(checkedDocumentRetainsClaim(prior,document,sha(document),'recon',{publicName:'Cedar Security'})).toBe(true);
  expect(checkedDocumentRetainsClaim(prior,document+' Changed scope.',sha(document+' Changed scope.'),'recon',{publicName:'Cedar Security'})).toBe(false);
  expect(checkedDocumentRetainsClaim(prior,document,sha(document),'recon',{publicName:'Other company'})).toBe(false);
  expect(checkedDocumentRetainsClaim({...prior,passage_digest:'a'.repeat(64)},document,sha(document),'recon',{publicName:'Cedar Security'})).toBe(false);
 });
});
