import {afterEach,it,expect,vi} from 'vitest';
import {reportJson,reportFailure} from '../../../lib/server/reports/http';
import {HttpFailure} from '../../../lib/contracts/http';
afterEach(()=>vi.unstubAllEnvs());
it('binds report responses to the serving release while preserving their existing contract',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA',undefined);vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
 const response=reportJson({synthetic:true});expect(response.status).toBe(200);expect(response.headers.get('x-turas-code-version')).toBe('a'.repeat(40));expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.json()).toMatchObject({contractVersion:'reports-v1',data:{synthetic:true},requestId:expect.any(String)});
});
it('binds report denials to the actual deployment and preserves their retry metadata',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA','b'.repeat(40));vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
 const response=reportFailure(new HttpFailure(429,'rate_limit','Synthetic rate denial',5));expect(response.status).toBe(429);expect(response.headers.get('x-turas-code-version')).toBe('b'.repeat(40));expect(response.headers.get('retry-after')).toBe('5');expect(await response.json()).toMatchObject({contractVersion:'reports-v1',error:{code:'rate_limit',retryable:true}});
});
it('does not invent a report release identity when no valid operational version exists',()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA',undefined);vi.stubEnv('TURAS_CODE_VERSION','invalid');
 expect(reportJson({}).headers.get('x-turas-code-version')).toBeNull();expect(reportFailure(new Error('Synthetic unavailable')).headers.get('x-turas-code-version')).toBeNull();
});
