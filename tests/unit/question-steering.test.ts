import {it,expect,vi,beforeEach} from 'vitest';
import type {AttachSessionFn} from 'eve/channels';
import type {CurrentSession} from '../../lib/server/auth/sessions';
import {turnFixture} from '../fixtures/eve-v27';
const mocks=vi.hoisted(()=>({pending:vi.fn(),cancel:vi.fn(),project:vi.fn()}));
vi.mock('../../lib/server/conversations/input-responses',()=>({pendingOwnedQuestionTurn:mocks.pending}));
vi.mock('../../lib/server/conversations/cancel',()=>({requestCancellation:mocks.cancel}));
vi.mock('../../lib/server/conversations/projection',()=>({projectNativeEvent:mocks.project}));
import {stopOwnedQuestionsForSteering} from '../../lib/server/conversations/question-steering';
beforeEach(()=>{vi.clearAllMocks();mocks.pending.mockResolvedValue({attemptId:'owned-attempt',turnId:'turn_0'});});
const actor={} as CurrentSession;
it('requires an actual terminal commit after requesting an owned question stop',async()=>{
 const fixture=turnFixture().commit({type:'turn.settled',scope:{turnId:'turn_0'},data:{turnId:'turn_0',outcome:'cancelled'}});
 const cancel=vi.fn(async()=>({}));const attach=(()=>({cancel,async*stream(){yield*fixture.events;}})) as unknown as AttachSessionFn;
 await stopOwnedQuestionsForSteering(actor,'wrun_synthetic',attach);
 expect(mocks.cancel).toHaveBeenCalledWith(actor,'wrun_synthetic','turn_0');expect(cancel).toHaveBeenCalledWith({turnId:'turn_0'});
 expect(mocks.project).toHaveBeenCalledWith('wrun_synthetic','owned-attempt',expect.objectContaining({type:'turn.cancelled',meta:expect.objectContaining({protocol:27})}),1);
});
it('does not treat an accepted cancellation as terminal proof',async()=>{
 const fixture=turnFixture();const attach=(()=>({cancel:async()=>({}),async*stream(){yield*fixture.events;}})) as unknown as AttachSessionFn;
 await expect(stopOwnedQuestionsForSteering(actor,'wrun_synthetic',attach)).rejects.toMatchObject({code:'question_stop_unconfirmed'});
 expect(mocks.project).not.toHaveBeenCalled();
});
