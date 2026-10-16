import {describe,it,expect} from 'vitest';
import {communityAttributionWarning,isVercelPublication} from '../../lib/server/research/specialists/solution-research/attribution';
import {bindCustomerUpdate} from '../../lib/server/research/specialists/solution-research/customer-update';
import {researchPassages} from '../../lib/server/research/specialists/solution-research/source-integrity';
import {context} from '../fixtures/legacy-specialist-contracts';

describe('active specialist source attribution',()=>{
 it('distinguishes community contributors from official publication channels and hosted customer content',()=>{
  for(const url of ['https://www.1password.community/t/preview-login','https://community.example.com/t/hosting','https://example.com/discussions/hosting','https://reddit.com/r/product/comments/123','https://github.com/vendor/product/issues/12'])expect(communityAttributionWarning({url})).toContain('not the target customer');
  for(const url of ['https://www.1password.community/product-updates','https://customer.example.com/blog/architecture','https://vercel.com/customers/example'])expect(communityAttributionWarning({url})).toBeNull();
  for(const url of ['https://vercel.com/docs','https://v0.app/docs/usage','https://v0.dev/pricing'])expect(isVercelPublication(url)).toBe(true);
  for(const url of ['https://customer.vercel.app','https://v0.app/chat/customer-app','https://v0.app.example.test/docs'])expect(isVercelPublication(url)).toBe(false);
 });
 it('retains exact community evidence while blocking unsupported transfer to the target customer',()=>{
  const source={id:'forum-source',url:'https://community.example.com/t/preview-login',title:'Public product-user report',retrievedAt:'2026-09-21T12:00:00Z',excerpt:'Anonymous author: We host our website on Vercel and use this password manager. Preview login matching causes friction.'};
  const bound=bindCustomerUpdate({accountId:context.accountId,question:'What infrastructure does the customer use?',findings:[{claim:'The customer hosts its website on Vercel.',scope:'Customer website',sourceId:source.id,passageId:researchPassages(source)[0].id,publisherType:'customer'}],conflicts:[],unknowns:[]},[source]);
  expect(bound.update.accountId).toBe(context.accountId);expect(bound.update.findings).toHaveLength(1);
  expect(bound.update.findings[0]).toMatchObject({publisherType:'other',quote:source.excerpt,url:source.url});
  expect(bound.update.findings[0].claim).not.toContain('customer hosts');expect(bound.update.findings[0].scope).toContain('not evidence');
  expect(bound.update.findings[0].attributionWarning).toContain("author's employer");
  expect(bound.sources[0].excerpt).toBe(source.excerpt);expect(bound.blockers.some(b=>b.includes('Unverified community attribution'))).toBe(true);
 });
});
