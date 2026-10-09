import {describe,it,expect} from "vitest";
import {calculatePartnerProgress} from "../../lib/server/partners/progress";
const checkpoints=[{id:"a",required:true,prerequisiteIds:[]},{id:"b",required:true,prerequisiteIds:["a"]},{id:"c",required:true,prerequisiteIds:[]},{id:"optional",required:false,prerequisiteIds:[]}];
describe("current partner learning progress",()=>{
 it("uses the required fraction, floors percentages and excludes optional credit",()=>{expect(calculatePartnerProgress("eligible",checkpoints,new Set(["a","optional"]))).toEqual({verifiedRequired:1,totalRequired:3,percentage:33});});
 it("removes dependent credit when a prerequisite loses current evidence",()=>{expect(calculatePartnerProgress("eligible",checkpoints,new Set(["b","c"]))).toEqual({verifiedRequired:1,totalRequired:3,percentage:33});});
 it("withholds current progress for unavailable or old assignments",()=>{for(const availability of ["obsolete","authority_changed","source_unavailable","purged","withdrawn","retired"] as const)expect(calculatePartnerProgress(availability,checkpoints,new Set(["a","b","c"]))).toBeNull();});
 it("counts prerequisites recursively and never inherits another assignment's verification",()=>{expect(calculatePartnerProgress("eligible",checkpoints,new Set())).toEqual({verifiedRequired:0,totalRequired:3,percentage:0});expect(calculatePartnerProgress("eligible",checkpoints,new Set(["a","b","c"]))).toEqual({verifiedRequired:3,totalRequired:3,percentage:100});});
});
