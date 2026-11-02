import {describe,expect,it,vi} from 'vitest';
import {resolveDynamic} from '../fixtures/dynamic';
import type {DynamicContext} from 'eve/tools';
vi.mock('../../lib/server/conversations/feature',()=>({responseFeature:async()=>({kind:'support'})}));
const read=vi.hoisted(()=>vi.fn(()=>{throw Error('Ordinary context must not be read for Support');}));
vi.mock('../../lib/server/db/client',()=>({withTransaction:read}));
import artifacts from '../../agent/instructions/artifact-context';
import plans from '../../agent/instructions/plan-context';
import retrieval from '../../agent/instructions/retrieval-context';
const ctx={session:{auth:{current:{principalId:'owned-support',attributes:{turasAttemptId:'owned-attempt'}}}},turn:{id:'owned-turn'}} as unknown as DynamicContext;
describe('Support instruction isolation',()=>{
 it('uses dedicated Support context without ordinary artifact, plan or retrieval context',async()=>{
  for(const instruction of [artifacts,plans,retrieval])expect(await resolveDynamic(instruction,ctx)).toBeNull();
  expect(read).not.toHaveBeenCalled();
 });
});
