import {expect,it,vi} from 'vitest';

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
