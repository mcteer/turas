import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),library:vi.fn()}));
vi.mock('../../lib/server/auth/sessions',()=>({getCurrentSession:mocks.session}));
vi.mock('../../lib/server/research/specialists/research-cache/library',()=>({sourceLibrary:mocks.library}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'test-library-route'})}));
import {GET} from '../../app/api/customers/[customerId]/sources/route';
const id='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{vi.clearAllMocks();mocks.session.mockResolvedValue({principalId:'owner'});mocks.library.mockResolvedValue({sources:[],more:false});});
it('authenticates before collection reads and keeps no-store failures',async()=>{
 mocks.session.mockResolvedValue(null);const response=await GET(new Request('http://localhost/api/customers/'+id+'/sources'),{params:Promise.resolve({customerId:id})});
 expect(response.status).toBe(401);expect(response.headers.get('cache-control')).toContain('no-store');expect(mocks.library).not.toHaveBeenCalled();
});
it('validates bounded offsets and passes the authenticated owner and exact offset',async()=>{
 for(const value of ['-1','100001','abc','0.5']){expect((await GET(new Request('http://localhost/api/customers/'+id+'/sources?offset='+value),{params:Promise.resolve({customerId:id})})).status).toBe(400);}
 expect(mocks.library).not.toHaveBeenCalled();
 const response=await GET(new Request('http://localhost/api/customers/'+id+'/sources?offset=20'),{params:Promise.resolve({customerId:id})});
 expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
 expect(mocks.library).toHaveBeenCalledWith({principalId:'owner',userId:'owner',environmentId:'test-library-route'},id,expect.any(AbortSignal),20);
});
