import {it,expect} from 'vitest';
import {deriveWorkHostInventory} from '../../../lib/server/operations/work-host-inventory';
const deployment={id:'dpl_current',url:'current.vercel.app'};
const alias={id:'alias_current',host:'app.example.com',deploymentId:'dpl_current',deploymentHost:'current.vercel.app',deletedAt:null,redirect:null,redirectStatusCode:null};
it('includes immutable URLs and live aliases without granting HTTP closure',()=>{
 const proof=deriveWorkHostInventory({deployments:[deployment],aliases:[alias],maximumHosts:10});
 expect(proof.rows.map(row=>row.host)).toEqual(['app.example.com','current.vercel.app']);expect(proof.httpAdmissionClosed).toBe(false);
});
it('preserves live aliases and immutable hosts for deployments missing from the deployment list',()=>{
 expect(deriveWorkHostInventory({deployments:[],aliases:[alias],maximumHosts:10}).rows).toHaveLength(2);
});
it('rejects ambiguous routing conflicting bindings and duplicate identities',()=>{
 for(const change of [{redirect:'https://other.example.com'},{deploymentId:null},{deploymentHost:'other.vercel.app'}])expect(()=>deriveWorkHostInventory({deployments:[deployment],aliases:[{...alias,...change}],maximumHosts:10})).toThrow();
 expect(()=>deriveWorkHostInventory({deployments:[deployment],aliases:[alias,{...alias,id:'alias_other',deploymentId:'dpl_other'}],maximumHosts:10})).toThrow();
 expect(()=>deriveWorkHostInventory({deployments:[],aliases:[alias,{...alias,id:'alias_other',host:'other.example.com',deploymentHost:'other.vercel.app'}],maximumHosts:10})).toThrow('immutable deployment host differs');
 expect(()=>deriveWorkHostInventory({deployments:[deployment,deployment],aliases:[],maximumHosts:10})).toThrow();
});
it('enforces the complete host bound and ignores only explicitly deleted aliases',()=>{
 expect(()=>deriveWorkHostInventory({deployments:[deployment],aliases:[alias],maximumHosts:1})).toThrow('bound');
 expect(deriveWorkHostInventory({deployments:[deployment],aliases:[{...alias,deletedAt:1}],maximumHosts:1}).rows).toHaveLength(1);
});
