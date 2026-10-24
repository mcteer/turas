import {expect,it,vi} from 'vitest';

const admission=vi.hoisted(()=>vi.fn<()=>Promise<boolean>>());
vi.mock('../../../lib/server/operations/session-admission',async original=>({
 ...await original<typeof import('../../../lib/server/operations/session-admission')>(),
 operationalAdmissionOpen:admission,
}));

// A login/session import must not initialize the full recovery/domain graph.
// Locked-mode and cross-module cancellation behavior are exercised with real
// owned databases by the admission and recovery integration suites.
vi.mock('../../../lib/server/operations/admission',()=>{
 throw new Error('Ordinary session authentication loaded the recovery admission graph');
});

it('loads ordinary session authentication without recovery admission',async()=>{
 const sessions=await import('../../../lib/server/auth/sessions');
 expect(sessions.createSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(typeof sessions.issueSession).toBe('function');
 expect(typeof sessions.getCurrentSession).toBe('function');
});

it('denies missing and empty ordinary cookies without consulting admission',async()=>{
 const {getCurrentSession}=await import('../../../lib/server/auth/sessions');
 admission.mockReset().mockImplementation(()=>{throw Error('Unauthenticated request consulted admission');});
 for(const headers of [undefined,{cookie:''}]){
  await expect(getCurrentSession(new Request('http://localhost/api/auth/session',{headers}))).resolves.toBeNull();
 }
 expect(admission).not.toHaveBeenCalled();
});

it('still requires open admission for every nonempty ordinary cookie',async()=>{
 const {getCurrentSession}=await import('../../../lib/server/auth/sessions');
 admission.mockReset().mockResolvedValue(false);
 for(const cookie of ['turas_session='+'a'.repeat(43),'unrelated=value',';']){
  await expect(getCurrentSession(new Request('http://localhost/api/auth/session',{headers:{cookie}}))).resolves.toBeNull();
 }
 expect(admission).toHaveBeenCalledTimes(3);
});
