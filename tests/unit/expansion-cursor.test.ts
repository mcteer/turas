import {describe,it,expect} from 'vitest';
import {encodeExpansionCursor,decodeExpansionCursor} from '../../lib/server/expansion/cursor';
const binding='a'.repeat(64),generation='b'.repeat(64),asOf=Date.now();
describe('Expansion opaque cursor lifetime',()=>{
 it('expires at five minutes, rejects future as-of times and binds type and generations',()=>{
  const raw=encodeExpansionCursor({binding,generation,kind:'list',offset:2,asOf});
  expect(decodeExpansionCursor(raw,binding,'list',generation,asOf+299999).offset).toBe(2);
  for(const check of [()=>decodeExpansionCursor(raw,binding,'list',generation,asOf+300000),()=>decodeExpansionCursor(raw,binding,'list',generation,asOf-1),()=>decodeExpansionCursor(raw,binding,'history',generation,asOf),()=>decodeExpansionCursor(raw,binding,'list','c'.repeat(64),asOf),()=>decodeExpansionCursor(raw,'d'.repeat(64),'list',generation,asOf),()=>decodeExpansionCursor('x'.repeat(4097),binding,'list',generation,asOf),()=>decodeExpansionCursor(`${raw}x`,binding,'list',generation,asOf)])expect(check).toThrowError(/refresh|Refresh/);
 });
});
