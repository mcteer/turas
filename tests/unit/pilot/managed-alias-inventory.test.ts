import {it,expect} from 'vitest';
import {canonicalManagedHost,inventoryManagedAliases} from '../../../lib/server/operations/managed-alias-inventory';
const row=(id:string,createdAt=100)=>({alias:id+'.example.com',created:new Date(createdAt).toISOString(),createdAt,creator:{},deletedAt:null,deployment:{id:'dpl_original',url:'original.vercel.app'},deploymentId:'dpl_original',projectId:'prj_original',redirect:null,redirectStatusCode:null,uid:id,updatedAt:createdAt});
const page=(aliases:ReturnType<typeof row>[],next:number|null=null)=>({aliases,pagination:{count:aliases.length,next,prev:null}});
const input={projectId:'prj_original',teamId:'team_original',cutoff:1000,signal:AbortSignal.timeout(10000)};
it('normalizes DNS spelling and default ports while rejecting ambiguous or credential-bearing hosts',()=>{
 expect(canonicalManagedHost('EXAMPLE.com:443')).toBe('example.com');expect(canonicalManagedHost('example.com.')).toBe('example.com');
 for(const host of ['*.example.com','user@example.com','example.com/path','example.com?secret=x','example.com:444','127.0.0.1','[::1]','https://example.com','example..com',' example.com','example.com/','example.com?','example.com#','example.com\\path','example.com:','exam\nple.com'])expect(()=>canonicalManagedHost(host)).toThrow();
});
it('exhausts both alias traversals including custom and branch hosts without granting closure',async()=>{
 const cursors:number[]=[];const result=await inventoryManagedAliases({...input,list:async until=>{cursors.push(until);return until===1000?page([row('branch')],99):page([row('custom',90)]);}});
 expect(cursors).toEqual([1000,99,1000,99]);expect(result).toMatchObject({pages:[2,2],rows:[{host:'branch.example.com'},{host:'custom.example.com'}],oldHostsClosed:false,providerWrites:0,restorationReady:false});
});
it('rejects foreign routing mismatched identities duplicate DNS and incomplete page counts',async()=>{
 for(const value of [page([{...row('one'),projectId:'prj_foreign'}]),page([{...row('one'),deploymentId:'dpl_changed'}]),page([row('one'),{...row('two'),alias:'ONE.example.com:443'}]),{...page([row('one')]),pagination:{count:0,next:null,prev:null}}])await expect(inventoryManagedAliases({...input,list:async()=>value})).rejects.toThrow();
});
it('rejects cursor cycles overflow changed inventories and undocumented routing fields',async()=>{
 await expect(inventoryManagedAliases({...input,list:async()=>page([row('one')],1000)})).rejects.toThrow('cursor');
 let calls=0;await expect(inventoryManagedAliases({...input,list:async()=>page([row(++calls===1?'one':'changed')])})).rejects.toThrow('changed');
 await expect(inventoryManagedAliases({...input,list:async()=>page([{...row('one'),microfrontends:{}} as ReturnType<typeof row>])})).rejects.toThrow();
 let index=0;await expect(inventoryManagedAliases({...input,cutoff:100000,list:async until=>page([row('row'+(++index),until)],until-1)})).rejects.toThrow('page bound');
});
