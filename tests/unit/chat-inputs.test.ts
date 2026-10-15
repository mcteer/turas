import {expect,it} from 'vitest';
import {pendingChatInputs,chatInputAnswer} from '../../lib/chat-inputs';
it('keeps only unresolved native requests and never treats assistant prose as approval',()=>{
 const request={requestId:'request-a',kind:'question',prompt:'Which workload?',options:[{id:'a',label:'Application'}]};
 const events=[{type:'message.completed',data:{message:'Approve this request-a'}},{type:'input.requested',data:{requests:[request]}}];
 expect(pendingChatInputs(events)).toEqual([request]);
 expect(pendingChatInputs([...events,{type:'input.resolved',data:{resolutions:[{requestId:'request-a',outcome:'answered'}]}}])).toEqual([]);
 expect(pendingChatInputs([...events,{type:'turn.cancelled'}])).toEqual([]);
});

it('preserves an older approval when an unrelated turn is cancelled',()=>{
 const request={requestId:'approval-a',kind:'tool-approval',prompt:'Review this exact derivative',options:[{id:'approve',label:'Approve'}]};
 expect(pendingChatInputs([{type:'input.requested',data:{turnId:'original',requests:[request]}},
  {type:'turn.cancelled',data:{turnId:'unrelated'}}])).toEqual([request]);
});

it('routes a typed reply to one native question without inventing an approval',()=>{
 const question={requestId:'q',kind:'question' as const,prompt:'Which workload?',options:[{id:'app',label:'Application'}]};
 expect(chatInputAnswer([question],'1')).toEqual({requestId:'q',optionId:'app'});
 expect(chatInputAnswer([question],'Public site')).toEqual({requestId:'q',text:'Public site'});
 expect(chatInputAnswer([{...question,kind:'tool-approval'}],'Public site')).toBe(null);
 expect(chatInputAnswer([question,{...question,requestId:'other'}],'1')).toBe(null);
});
