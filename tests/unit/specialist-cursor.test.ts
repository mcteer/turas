import {it,expect,vi} from 'vitest';
vi.mock('../../lib/server/config',()=>({getServerConfig:()=>({TURAS_MAINTENANCE_SECRET:'synthetic-specialist-cursor-secret'})}));
import {encodeSpecialistCursor,decodeSpecialistCursor} from '../../lib/server/research/specialists/discussion-cursor';
it('binds a stable timestamp/ID page to the exact owner and conversation',()=>{
 const at='2026-11-01T00:00:00.000Z',id='12345678-1234-4234-8234-123456789abc';
 const cursor=encodeSpecialistCursor(at,id,'owner:conversation',1000);
 expect(decodeSpecialistCursor(cursor,'owner:conversation',2000)).toMatchObject({at,id});
 for(const [value,binding,now] of [[cursor,'other:conversation',2000],[cursor+'x','owner:conversation',2000],[cursor,'owner:conversation',901000]] as const)
  expect(()=>decodeSpecialistCursor(value,binding,now)).toThrow();
});
