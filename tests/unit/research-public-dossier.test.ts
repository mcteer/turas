import {describe,it,expect} from 'vitest';
import {publicDigest,validatePublicDossier,publicSubjectMention,dossierAreas,publicResearchQueries,normalizePublicDraft} from '../../lib/server/research/public-dossier';
const customer={name:'Cedar Company',industries:[],directoryListed:true,stories:[]};
const text='Cedar Company reports a bounded improvement for its public documentation workload.';
const pages=[{url:'https://publisher.org/cedar',title:'Public report',text,bodyDigest:'a'.repeat(64),normalizedDigest:publicDigest(text),retrievedAt:new Date().toISOString(),publishedAt:null,discoveryPurpose:'identity'}];
const dossier={description:'Reported public description',findings:[{area:'identity',statement:'The company reports a documentation improvement.',sourceIndex:0,quote:text,attribution:'Company report',caveats:['Self-reported']}],coverage:dossierAreas.map(area=>({area,state:area==='identity'?'supported':'not_found',explanation:'Bounded discovery result'})),unknowns:['Formal maturity is unknown']};
describe('public customer dossier contracts',()=>{
 it('retains exact supported quotes and complete unique coverage',()=>expect(validatePublicDossier(dossier,customer,pages)).toMatchObject({findings:[{quote:text}]}));
 it('rejects fabricated quotations and cross-customer sources',()=>{
  expect(()=>validatePublicDossier({...dossier,findings:[{...dossier.findings[0],quote:'Fabricated exact quote falsely presented as public source evidence.'}]},customer,pages)).toThrow();
  expect(()=>validatePublicDossier(dossier,{...customer,name:'Other Company'},pages)).toThrow();
 });
 it('rejects altered source receipts and unsupported coverage',()=>{
  expect(()=>validatePublicDossier(dossier,customer,[{...pages[0],normalizedDigest:'b'.repeat(64)}])).toThrow();
  expect(()=>validatePublicDossier({...dossier,coverage:dossier.coverage.map(c=>({...c,state:'supported'}))},customer,pages)).toThrow();
 });
 it('unwraps a captured model correction without admitting extra model fields',()=>{
  const corrected=normalizePublicDraft({customer:{accepted:true},dossier:{...dossier,issues:['Removed overstatement'],sources:['Model-proposed source']}},customer,pages);
  expect(validatePublicDossier(corrected,customer,pages).findings).toHaveLength(1);
  expect(corrected).not.toHaveProperty('customer');expect(corrected).not.toHaveProperty('sources');
 });
 it('quarantines quotes from a retained window that no longer establishes the subject',()=>{
  const unrelated=text.replace('Cedar Company','Other Company');
  const proposed={...dossier,findings:[{...dossier.findings[0],quote:unrelated}]};
  const normalized=normalizePublicDraft(proposed,customer,[{...pages[0],text:unrelated,normalizedDigest:publicDigest(unrelated)}]);
  expect(normalized.findings).toEqual([]);expect(normalized.coverage.every(c=>c.state==='not_found')).toBe(true);
 });
 it('does not match a short identity within another word and discovers every research area',()=>{
  expect(publicSubjectMention('Acme builds public tools.','Acme')).toBe(true);
  expect(publicSubjectMention('Acmeology builds tools.','Acme')).toBe(false);
  expect(new Set(publicResearchQueries(customer).map(q=>q.purpose))).toEqual(new Set(dossierAreas));
 });
});
