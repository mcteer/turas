import {it,expect} from 'vitest';
import {inspectWorkHostDenyPolicy} from '../../../lib/server/operations/work-host-deny-policy';
const scope={projectId:'prj_original',teamId:'team_original',approvedHosts:['current.vercel.app']};
const policy=()=>({firewallEnabled:true,crs:{general:{active:false,action:'log'}},updatedAt:'2026-10-19T00:00:00Z',projectKey:'prj_original#active',id:'config_original',ips:[],changes:[],version:1,ownerId:'team_original',rules:[{id:'rule_original',name:'Current hosts',description:'Controlled exact host fence',active:true,valid:true,validationErrors:null,conditionGroup:[{conditions:[{type:'host',op:'ninc',value:['current.vercel.app']}]}],action:{mitigate:{action:'deny'}}}]});
it('validates only the exact first unconditional host deny without claiming provider or HTTP proof',()=>{
 expect(inspectWorkHostDenyPolicy(policy(),scope)).toMatchObject({version:1,allowedHosts:scope.approvedHosts,firstOnlyUnconditionalHostDenyValidated:true,providerReadVerified:false,httpAdmissionClosed:false,restorationReady:false});
});
it('rejects disabled draft foreign or unapproved policies',()=>{
 for(const change of [{firewallEnabled:false},{projectKey:'prj_original#draft'},{ownerId:'team_foreign'}])expect(()=>inspectWorkHostDenyPolicy({...policy(),...change},scope)).toThrow();
 expect(()=>inspectWorkHostDenyPolicy(policy(),{...scope,approvedHosts:['old.vercel.app']})).toThrow('approved bindings');
});
it('rejects skip paths extra conditions and unknown effective configuration',()=>{
 const p=policy();expect(()=>inspectWorkHostDenyPolicy({...p,rules:[p.rules[0],p.rules[0]]},scope)).toThrow();
 expect(()=>inspectWorkHostDenyPolicy({...p,ips:[{action:'bypass'}]},scope)).toThrow();
 expect(()=>inspectWorkHostDenyPolicy({...p,conditionalBypass:true},scope)).toThrow();
 expect(()=>inspectWorkHostDenyPolicy({...p,rules:[{...p.rules[0],action:{mitigate:{action:'bypass'}}}]},scope)).toThrow();
 expect(()=>inspectWorkHostDenyPolicy({...p,rules:[{...p.rules[0],conditionGroup:[{conditions:[{type:'host',op:'ninc',value:scope.approvedHosts,neg:true}]}]}]},scope)).toThrow();
});
it('rejects wildcard duplicate noncanonical and inverted host predicates',()=>{
 for(const value of [['*.vercel.app'],['current.vercel.app','current.vercel.app'],['CURRENT.vercel.app'],['current.vercel.app:443']]){const p=policy();p.rules[0].conditionGroup[0].conditions[0].value=value;expect(()=>inspectWorkHostDenyPolicy(p,{...scope,approvedHosts:value})).toThrow();}
 const p=policy();p.rules[0].conditionGroup[0].conditions[0].op='inc';expect(()=>inspectWorkHostDenyPolicy(p,scope)).toThrow();
});
