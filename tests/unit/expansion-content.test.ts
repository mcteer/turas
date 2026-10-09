import { describe, expect, it } from 'vitest';
import { expansionHypothesisSchema,validateExpansionReviewDate } from '../../lib/contracts/expansion';
import { canonicalExpansionProduct,validateProductAliases } from '../../lib/expansion/products';
import { discoveryHypothesis } from '../fixtures/expansion';

describe('Expansion content boundaries', () => {
  it('uses UTC inclusive review limits and rejects dates outside them',()=>{
    const at=new Date('2026-10-08T23:59:59Z');
    expect(validateExpansionReviewDate('2026-10-08',at)).toBe(true);
    expect(validateExpansionReviewDate('2027-10-09',at)).toBe(true);
    expect(validateExpansionReviewDate('2026-10-07',at)).toBe(false);
    expect(validateExpansionReviewDate('2027-10-10',at)).toBe(false);
  });
  it('canonicalizes only bounded provenanced aliases without claiming adoption',()=>{
    const entries=[{key:'synthetic-product',aliases:['Synthetic Legacy'],retired:true,provenance:'Synthetic reviewed identity'}];
    expect(canonicalExpansionProduct(' SYNTHETIC LEGACY ',entries)).toMatchObject({key:'synthetic-product',retired:true});
    expect(canonicalExpansionProduct('new-identity')).toMatchObject({key:'new-identity',retired:false});
    expect(()=>validateProductAliases([...entries,{...entries[0],key:'another'}])).toThrow();
    expect(()=>validateProductAliases([{...entries[0],provenance:' '}])).toThrow();
    expect(()=>validateProductAliases([{...entries[0],aliases:Array.from({length:21},(_,i)=>`alias-${i}`)}])).toThrow();
    expect(()=>validateProductAliases(Array.from({length:101},(_,i)=>({key:`product-${i}`,aliases:[],retired:false,provenance:'Synthetic reviewed identity'})))).toThrow();
    expect(()=>validateProductAliases([{...entries[0],aliases:['a'.repeat(201)]}])).toThrow();
    expect(()=>validateProductAliases([{...entries[0],aliases:['Case Alias','ＣＡＳＥ ＡＬＩＡＳ']}])).toThrow();
  });
  it('accepts exact text bounds and rejects oversize arrays and duplicate evidence keys',()=>{
    const content=discoveryHypothesis();
    expect(expansionHypothesisSchema.safeParse({...content,title:'a'.repeat(200),problem:'a'.repeat(2000)}).success).toBe(true);
    expect(expansionHypothesisSchema.safeParse({...content,problem:'a'.repeat(2001)}).success).toBe(false);
    expect(expansionHypothesisSchema.safeParse({...content,unknowns:Array.from({length:21},()=>({text:'Unknown',reason:'Needs validation'}))}).success).toBe(false);
    const key='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(expansionHypothesisSchema.safeParse({...content,currentUse:{kind:'evidenced',state:'actual',sourceKeys:[key,key]}}).success).toBe(false);
  });
  it('retains honest discovery with no claimed adoption or evidence', () => {
    const value=expansionHypothesisSchema.parse(discoveryHypothesis());
    expect(value.currentUse.kind).toBe('unknown');
    expect(value.benefit.kind).toBe('unknown');
  });
  it('rejects invented absent state and extra approval flags', () => {
    expect(expansionHypothesisSchema.safeParse({...discoveryHypothesis(),currentUse:{kind:'absent'}}).success).toBe(false);
    expect(expansionHypothesisSchema.safeParse({...discoveryHypothesis(),qualified:true}).success).toBe(false);
  });
  it('requires retaining current practice and owner for validation', () => {
    expect(expansionHypothesisSchema.safeParse({...discoveryHypothesis(),alternatives:[]}).success).toBe(false);
    expect(expansionHypothesisSchema.safeParse({...discoveryHypothesis(),prerequisites:[{id:'capacity',status:'validation_needed',rationale:'Inspect capacity',sourceKeys:[]}]}).success).toBe(false);
  });
  it('rejects malformed dates, oversized labels and noncanonical keys', () => {
    for(const patch of [{nextReviewDate:'2026-02-30'},{title:'a'.repeat(201)},{productKey:'Not A Key'}])
      expect(expansionHypothesisSchema.safeParse({...discoveryHypothesis(),...patch}).success).toBe(false);
  });
});
