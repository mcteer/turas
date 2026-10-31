import {describe,expect,it} from 'vitest';
import {countUnknownResearchIdentifiers,type ResearchCitationForValidation} from '../../scripts/research-output-citations';

const customerId='10000000-0000-4000-8000-000000000001';
const selectionId='20000000-0000-4000-8000-000000000001';
const otherSelectionId='20000000-0000-4000-8000-000000000002';
const citationId='30000000-0000-4000-8000-000000000001';
const otherCitationId='30000000-0000-4000-8000-000000000002';
const unitId='40000000-0000-4000-8000-000000000001';
const otherUnitId='40000000-0000-4000-8000-000000000002';
const inventedId='50000000-0000-4000-8000-000000000001';
const locator=(id=unitId,line=3)=>({kind:'artifact_unit',unitId:id,
  original:{kind:'txt',lineStart:line,lineEnd:line},start:0,end:20});
const citation=(changes:Partial<ResearchCitationForValidation>={}):ResearchCitationForValidation=>({
  id:citationId,source_kind:'approved_excerpt',source_revision_id:selectionId,
  consumed:true,current:true,locators:[locator()],...changes,
});
const count=(response:string,citations:readonly ResearchCitationForValidation[])=>
  countUnknownResearchIdentifiers({response,customerId,approvedSelectionId:selectionId,citations});

describe('research output citation identifiers',()=>{
  it('recognizes both exact units from current consumed source-matching citations',()=>{
    const response=`Line3: citation ${citationId} (unit ${unitId}). Line27: citation ${otherCitationId} (unit ${otherUnitId}).`;
    expect(count(response,[citation(),citation({id:otherCitationId,locators:[locator(otherUnitId,27)]})])).toBe(0);
  });
  it('keeps invented identifiers unknown while preserving customer and receipt identities',()=>{
    expect(count(`${customerId} ${citationId} ${inventedId} ${inventedId}`,[citation()])).toBe(1);
  });
  it('rejects unit identities from a different source selection',()=>{
    expect(count(unitId,[citation({source_revision_id:otherSelectionId})])).toBe(1);
  });
  it('rejects unit identities from a citation that was not consumed',()=>{
    expect(count(unitId,[citation({consumed:false})])).toBe(1);
  });
  it('rejects unit identities when a citation no longer resolves as current',()=>{
    expect(count(`${citationId} ${unitId}`,[citation({current:false})])).toBe(1);
  });
  it('rejects unit identities from another source kind',()=>{
    expect(count(unitId,[citation({source_kind:'accepted_profile'})])).toBe(1);
  });
  it('rejects malformed or non-unit locator identities',()=>{
    for(const value of [
      {kind:'profile_field',fieldPath:'owner',unitId},
      {...locator(),end:0},
      {...locator(),original:{kind:'txt',lineStart:0,lineEnd:0}},
    ])expect(count(unitId,[citation({locators:[value]})])).toBe(1);
  });
});
