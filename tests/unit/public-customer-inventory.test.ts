import {expect,it} from 'vitest';
import {filterPublicCustomerInventory,publicInventorySearchSchema} from '../../lib/server/profiles/public-inventory';
const accounts=[{id:'one',name:'Synthetic One',aliases:['Fixture Alias'],workloads:[],reviewed_on:null,directory_listed:null,story_count:null,
 stories:[{sourceRevisionId:'source-one',workload:'Checkout workload',products:['Vercel Sandbox'],signals:['Operational trust','Product adoption']}]},
 {id:'two',name:'Synthetic Two',aliases:[],workloads:['Public frontend'],products:['AI SDK'],reviewed_on:null,directory_listed:null,story_count:null,stories:[]}];
it('matches original case-insensitive name, alias, workload and product searches without inferring signals',()=>{
 for(const query of ['synthetic one','fixture alias','checkout','SANDBOX'])expect(filterPublicCustomerInventory(accounts,query).map(row=>row.id)).toEqual(['one']);
 expect(filterPublicCustomerInventory(accounts,'frontend').map(row=>row.id)).toEqual(['two']);
 expect(filterPublicCustomerInventory(accounts,'AI SDK').map(row=>row.id)).toEqual(['two']);
 expect(filterPublicCustomerInventory(accounts,'','Operational trust').map(row=>row.id)).toEqual(['one']);
 expect(filterPublicCustomerInventory(accounts,'AI SDK','Product adoption')).toEqual([]);
 expect(filterPublicCustomerInventory(accounts,'','Measurement and learning')).toEqual([]);
});
it('bounds inventory input and rejects invented formal maturity filters',()=>{
 expect(publicInventorySearchSchema.parse({})).toEqual({query:'',offset:0,limit:20});
 for(const input of [{query:'x'.repeat(161)},{offset:1001},{limit:21},{signal:'Advanced maturity'},{customerId:'model-supplied-scope'}])expect(publicInventorySearchSchema.safeParse(input).success).toBe(false);
});
