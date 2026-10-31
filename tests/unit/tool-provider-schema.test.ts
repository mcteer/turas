import {describe,expect,it,vi,afterEach} from 'vitest';
import {asSchema} from 'ai';
import {inputSchema as checklist} from '../../agent/tools/track_tasks';
import {inputSchema as research} from '../../agent/tools/propose_research';
import {inputSchema as evaluation} from '../../agent/tools/evaluate_solution_research';

import {context,brief,sources,identity} from '../fixtures/legacy-specialist-contracts';
import {signResearch} from '../../lib/server/research/specialists/solution-research/receipt';
afterEach(()=>vi.unstubAllEnvs());
const customerId='00000000-0000-4000-8000-000000000210';
describe('provider-compatible tool inputs',()=>{
 it('emits object input schemas with declared properties and no root union',()=>{
  for(const schema of [checklist,research,evaluation]){
   const wire=asSchema<unknown>(schema).jsonSchema;
   expect(wire.type).toBe('object');expect(wire.properties).toBeDefined();
   expect(wire.additionalProperties).toBe(false);
   for(const keyword of ['oneOf','anyOf','allOf'])expect(wire).not.toHaveProperty(keyword);
  }
 });
 it('retains checklist branch validation and rejects mixed or incomplete commands',()=>{
  expect(checklist.parse({action:'read'})).toEqual({action:'read'});
  expect(checklist.parse({action:'replace',expectedRevision:0,items:[]})).toEqual({action:'replace',expectedRevision:0,items:[]});
  for(const input of [{action:'replace'},{action:'read',items:[]},{action:'replace',expectedRevision:-1,items:[]},{action:'remove'},{action:'read',unknown:true},
   {action:'replace',expectedRevision:0,items:[{id:'a',text:'Synthetic task',status:'pending',unknown:true}]},{}])expect(checklist.safeParse(input).success).toBe(false);
 });
 it('retains each research mode and rejects cross-mode fields and missing data',()=>{
  for(const input of [{mode:'recon',publicName:'Synthetic',publicDomain:'example.com'},
   {mode:'practices',product:'Next.js',version:'16',topic:'Caching'},
   {mode:'fit',evidenceReceiptIds:[customerId]}])expect(research.parse(input)).toEqual(input);
  for(const input of [{mode:'recon',publicName:'Synthetic'},{mode:'fit',evidenceReceiptIds:[]},
   {mode:'fit',evidenceReceiptIds:[customerId],product:'Unexpected'},{mode:'practices',product:'Next.js',version:'16'},
   {mode:'fit',evidenceReceiptIds:[customerId],unknown:true}])expect(research.safeParse(input).success).toBe(false);
 });
 it('preserves exact research references and rejects incomplete signed receipts',()=>{
  vi.stubEnv('TURAS_MAINTENANCE_SECRET','synthetic-tool-schema-test-only');
  const receipt=signResearch({userId:identity.userId,environmentId:identity.environmentId,workspaceId:identity.workspaceId,issuedAt:'2026-10-29T00:00:00.000Z',context,brief,sources,blockers:[]});
  expect(evaluation.parse(receipt)).toEqual(receipt);
  expect(evaluation.parse({accountId:customerId})).toEqual({accountId:customerId});
  expect(evaluation.parse({accountId:customerId,researchId:'a'.repeat(64)})).toEqual({accountId:customerId,researchId:'a'.repeat(64)});
  for(const input of [{},{researchId:'a'.repeat(64)},{accountId:customerId,signature:'a'.repeat(64)},
   {accountId:customerId,researchId:'invalid'},{payload:{},signature:'a'.repeat(64)},{accountId:customerId,unknown:true},
   {...receipt,unknown:true},{...receipt,payload:{...receipt.payload,context:{...receipt.payload.context,unknown:true}}}])expect(evaluation.safeParse(input).success).toBe(false);
 });
});
