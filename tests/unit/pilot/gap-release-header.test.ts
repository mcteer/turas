import {afterEach,it,expect,vi} from 'vitest';
import type {GapActor} from '../../../lib/server/gaps/policy';
const mocks=vi.hoisted(()=>({current:vi.fn(),metadata:{format:'json',review_id:'00000000-0000-4000-8000-000000000001',audience_digest:'c'.repeat(64),content_digest:'d'.repeat(64),size_bytes:2}}));
vi.mock('../../../lib/server/gaps/commands',()=>({gapRead:async(_actor:unknown,run:(db:unknown)=>Promise<unknown>)=>run({query:async()=>({rows:[mocks.metadata]})})}));
vi.mock('../../../lib/server/gaps/report-release',()=>({assertGapExportCurrent:mocks.current,gapExportChunks:async function*(){yield Buffer.from('{}');},gapApprovedReport:async()=>({review:{created_at:new Date('2026-10-13T00:00:00Z'),reviewer_membership_id:'00000000-0000-4000-8000-000000000002'}})}));
vi.mock('../../../lib/server/config',()=>({getServerConfig:()=>({TURAS_ENVIRONMENT_ID:'test-unit-synthetic'})}));
import {gapExportResponse} from '../../../lib/server/gaps/report-artifacts';
afterEach(()=>{vi.unstubAllEnvs();mocks.current.mockReset();});
it('binds actual streamed gap exports to the serving deployment while preserving review and integrity headers',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA','b'.repeat(40));vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));mocks.current.mockResolvedValue(undefined);
 const response=await gapExportResponse({} as GapActor,'synthetic-report','synthetic-export');
 expect(response.headers.get('x-turas-code-version')).toBe('b'.repeat(40));expect(response.headers.get('x-turas-review-id')).toBe(mocks.metadata.review_id);expect(response.headers.get('x-turas-content-digest')).toBe(mocks.metadata.content_digest);expect(response.headers.get('x-turas-byte-length')).toBe('2');expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).toBe('{}');expect(mocks.current).toHaveBeenCalled();
});
it('withholds stream bytes on a changed release fence and invents no absent code identity',async()=>{
 vi.stubEnv('VERCEL_GIT_COMMIT_SHA',undefined);vi.stubEnv('TURAS_CODE_VERSION','invalid');mocks.current.mockRejectedValue(new Error('Synthetic source withheld'));
 const response=await gapExportResponse({} as GapActor,'synthetic-report','synthetic-export');
 expect(response.headers.get('x-turas-code-version')).toBeNull();await expect(response.text()).rejects.toThrow('Synthetic source withheld');
});
