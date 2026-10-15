import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({maintenance:vi.fn()}));
vi.mock('../../lib/server/research/specialists/research-cache/maintenance',()=>({maintainResearchEvidence:mocks.maintenance}));
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'test-maintenance-route'})}));
import {GET} from '../../app/api/internal/research-maintenance/route';
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
it('requires the exact service bearer before any maintenance or provider work',async()=>{
 const secret='synthetic-maintenance-secret-1234567890';vi.stubEnv('CRON_SECRET',secret);
 const denied:HeadersInit[]=[{},{authorization:'Bearer wrong'},{authorization:'Bearer '+secret,cookie:'turas_session=synthetic'}];
 for(const headers of denied){
  expect((await GET(new Request('https://synthetic.invalid/api/internal/research-maintenance',{headers}))).status).toBe(403);
 }
 expect(mocks.maintenance).not.toHaveBeenCalled();
 mocks.maintenance.mockResolvedValue({refreshAttempted:0,indexingAttempted:0});
 const result=await GET(new Request('https://synthetic.invalid/api/internal/research-maintenance',{headers:{authorization:'Bearer '+secret}}));
 expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');
 expect(mocks.maintenance).toHaveBeenCalledWith('test-maintenance-route',expect.any(AbortSignal));
});
it('does not leak maintenance failures or accept an absent service secret',async()=>{
 vi.stubEnv('CRON_SECRET','');expect((await GET(new Request('https://synthetic.invalid/api/internal/research-maintenance'))).status).toBe(403);
 vi.stubEnv('CRON_SECRET','synthetic-maintenance-secret-1234567890');mocks.maintenance.mockRejectedValue(Error('Private provider details'));
 const result=await GET(new Request('https://synthetic.invalid/api/internal/research-maintenance',{headers:{authorization:'Bearer synthetic-maintenance-secret-1234567890'}}));
 expect(result.status).toBe(503);expect(JSON.stringify(await result.json())).not.toContain('Private provider details');
});
