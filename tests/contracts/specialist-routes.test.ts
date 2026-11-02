import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),csrf:vi.fn(),list:vi.fn(),fence:vi.fn(),cancel:vi.fn()}));
vi.mock('../../lib/server/auth/sessions',()=>({getCurrentSession:mocks.session}));
vi.mock('../../lib/server/auth/csrf',()=>({checkSessionCsrf:mocks.csrf}));
vi.mock('../../lib/server/research/specialists/discussion-status',()=>({listOwnedSpecialists:mocks.list}));
vi.mock('../../lib/server/research/specialists/discussions',()=>({fenceSpecialistCancellation:mocks.fence}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_APP_ORIGIN:'https://example.org'})}));
vi.mock('eve/workflow/api',()=>({resumeHook:(token:string,_payload:unknown)=>mocks.cancel(token)}));
import {GET} from '../../app/api/conversations/[id]/specialists/route';
import {POST as proxyPOST} from '../../app/api/conversations/[id]/specialists/[discussionId]/cancel/route';
import {cancelSpecialistInRuntime} from '../../lib/server/research/specialists/discussion-control';
const POST=(request:Request,_context:unknown)=>cancelSpecialistInRuntime(request,discussionId);
import {HttpFailure} from '../../lib/contracts/http';
const id='12345678-1234-4234-8234-123456789abc',discussionId='12345678-1234-4234-8234-123456789abd';
const context={params:Promise.resolve({id,discussionId})};
const request=(body:unknown={requestKey:id})=>new Request('https://example.org/api/conversations/'+id+'/specialists/'+discussionId+'/cancel',{method:'POST',headers:{origin:'https://example.org','content-type':'application/json'},body:JSON.stringify({conversationId:id,...body as object})});
beforeEach(()=>{vi.resetAllMocks();mocks.session.mockResolvedValue({principalId:'owner'});mocks.list.mockResolvedValue({contract:'specialist-discussions-v1',items:[]});mocks.fence.mockResolvedValue({workflowRunId:'server-bound-run',controlHookToken:'server-bound-token',state:'stopping'});});
it('requires a current owner session for reads and controls',async()=>{
 mocks.session.mockResolvedValue(null);
 expect((await GET(new Request('https://example.org/'),context)).status).toBe(401);
 expect((await POST(request(),context)).status).toBe(401);
 expect(mocks.list).not.toHaveBeenCalled();expect(mocks.cancel).not.toHaveBeenCalled();
});
it('rejects origin/CSRF failures before resolving a native control target',async()=>{
 mocks.csrf.mockImplementation(()=>{throw new HttpFailure(403,'csrf_denied','Denied');});
 expect((await POST(request(),context)).status).toBe(403);expect(mocks.fence).not.toHaveBeenCalled();
});
it('denies a foreign discussion without touching any workflow',async()=>{
 mocks.fence.mockRejectedValue(new HttpFailure(404,'not_found','Not found'));
 expect((await POST(request(),context)).status).toBe(404);expect(mocks.cancel).not.toHaveBeenCalled();
});
it('cannot accept a native run ID from the browser',async()=>{
 expect((await POST(request({requestKey:id,workflowRunId:'foreign'}),context)).status).toBe(422);expect(mocks.fence).not.toHaveBeenCalled();
});
it('commits the owned fence before public cancellation, preserving uncertainty',async()=>{
 mocks.cancel.mockImplementation(async()=>{expect(mocks.fence).toHaveBeenCalledOnce();throw Error('lost acknowledgement');});
 const response=await POST(request(),context);expect(response.status).toBe(202);expect((await response.json()).data).toEqual({state:'stopping'});
 expect(mocks.cancel).toHaveBeenCalledWith('server-bound-token');
});
it('does not issue native cancellation again for an already settled discussion',async()=>{
 mocks.fence.mockResolvedValue({state:'closed',closedAt:new Date(),workflowRunId:'old'});
 expect((await POST(request(),context)).status).toBe(200);expect(mocks.cancel).not.toHaveBeenCalled();
});

it('forwards control to the trusted same-origin Eve service after fencing',async()=>{
 const transport=vi.fn(async(input:URL|RequestInfo,options?:RequestInit)=>{
  expect(String(input)).toBe('https://example.org/eve/v1/turas/specialists/'+discussionId+'/cancel');
  expect(mocks.fence).toHaveBeenCalled();expect(options?.redirect).toBe('error');
  expect(JSON.parse(options?.body as string)).toEqual({conversationId:id,requestKey:id});
  return Response.json({data:{state:'stopping'}},{status:202});
 });
 vi.stubGlobal('fetch',transport);
 try{
  const raw=new Request('https://example.org/api/conversations/'+id+'/specialists/'+discussionId+'/cancel',{method:'POST',headers:{origin:'https://example.org','content-type':'application/json'},body:JSON.stringify({requestKey:id})});
  expect((await proxyPOST(raw,context)).status).toBe(202);expect(transport).toHaveBeenCalledOnce();expect(mocks.cancel).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
