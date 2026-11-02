import {beforeEach,expect,it,vi} from 'vitest';
const checks=vi.hoisted(()=>({deny:vi.fn(),approve:vi.fn()}));
vi.mock('../../lib/server/ordinary-operations/interventions',async importOriginal=>({
 ...await importOriginal<typeof import('../../lib/server/ordinary-operations/interventions')>(),
 authorizeOrdinaryInterventionDenial:checks.deny,approveOrdinaryIntervention:checks.approve,
}));
import {authoredTool} from '../../agent/tools/record_engagement_intervention';
const approval=authoredTool.approval;
if(!approval||typeof approval!=='object'||!approval.response)throw new Error('Expected a responder policy');
const respond=approval.response;
const principal={principalId:'exact-responder',principalType:'user',authenticator:'turas-session'};
const input={proposalId:'exact-proposal'};
beforeEach(()=>{vi.resetAllMocks();});
it('rejects an unauthorized denial without creating an approval receipt',async()=>{
 checks.deny.mockRejectedValue(new Error('Reviewer rights required'));
 const result=await respond({response:{decision:'deny',principal},request:{toolInput:input}} as never);
 expect(result.status).toBe('rejected');expect(checks.deny).toHaveBeenCalledWith(principal,input);
 expect(checks.approve).not.toHaveBeenCalled();
});
it('allows an authorized denial without recording the requested intervention',async()=>{
 checks.deny.mockResolvedValue(undefined);
 expect(await respond({response:{decision:'deny',principal},request:{toolInput:input}} as never)).toEqual({status:'allowed'});
 expect(checks.deny).toHaveBeenCalledWith(principal,input);expect(checks.approve).not.toHaveBeenCalled();
});
it('binds approval to the actual interaction and call',async()=>{
 checks.approve.mockResolvedValue({});
 expect(await respond({response:{decision:'approve',principal},request:{toolInput:input,interactionId:'interaction-owned',callId:'call-owned'}} as never)).toEqual({status:'allowed'});
 expect(checks.approve).toHaveBeenCalledWith(principal,input,{requestId:'interaction-owned',callId:'call-owned'});
 expect(checks.deny).not.toHaveBeenCalled();
});
