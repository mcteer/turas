import {afterEach,it,expect,vi} from 'vitest';
import {handleMcpRequest} from '../../../lib/server/mcp/transport';
afterEach(()=>vi.unstubAllEnvs());
const request=()=>new Request('https://synthetic.invalid/api/mcp/v1',{method:'GET'});
it('binds method denials to the exact serving release without changing the MCP body',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA',undefined);vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
 const response=await handleMcpRequest(request());expect(response.status).toBe(405);expect(response.headers.get('x-turas-code-version')).toBe('a'.repeat(40));expect(response.headers.get('allow')).toBe('POST');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).toBe('');
});
it('prefers the actual deployment commit over a different local code version',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA','b'.repeat(40));vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
 expect((await handleMcpRequest(request())).headers.get('x-turas-code-version')).toBe('b'.repeat(40));
});
it('preserves predecessor behavior without inventing a deployment identity',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA',undefined);vi.stubEnv('TURAS_CODE_VERSION','invalid');
 const response=await handleMcpRequest(request());expect(response.status).toBe(405);expect(response.headers.get('x-turas-code-version')).toBeNull();
});
