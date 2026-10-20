import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChatInputRequestCard} from '../../app/_components/chat-input-request';
import {expect,it} from 'vitest';
import {pendingChatInputs,chatInputAnswer,approvalReviewReady} from '../../lib/chat-inputs';
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

it('preserves the exact native approval action for human review, including nested proposed evidence',()=>{
 const action={toolName:'review_solution_pattern',callId:'call-exact',input:{command:{expectedVersion:7,limitations:'A proposed limitation, not accepted evidence.',attestations:{redacted:true},source:{excerpt:'<script>untrusted proposal</script>'}}}};
 const [request]=pendingChatInputs([{type:'input.requested',data:{requests:[{requestId:'review-exact',kind:'tool-approval',prompt:'Review proposed publication',action,options:[{id:'approve',label:'Approve'}]}]}}]);
 expect(request.action).toEqual(action);expect(approvalReviewReady(request)).toBe(true);
 const markup=renderToStaticMarkup(createElement(ChatInputRequestCard,{request,disabled:false,onResponse:async()=>{throw Error('Server rendering cannot approve');}}));
 expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Approve<\/button>/);
 expect(markup).toContain('&lt;script&gt;untrusted proposal&lt;/script&gt;');
 expect(chatInputAnswer([request],'Approve')).toEqual({requestId:'review-exact',optionId:'approve'});
});
it('does not offer a typed approval shortcut without inspectable native inputs',()=>{
 const request={requestId:'missing',kind:'tool-approval' as const,prompt:'Details missing',options:[{id:'approve',label:'Approve'},{id:'cancel',label:'Cancel'}]};
 expect(approvalReviewReady(request)).toBe(false);expect(chatInputAnswer([request],'Approve')).toBe(null);
 expect(chatInputAnswer([request],'Cancel')).toEqual({requestId:'missing',optionId:'cancel'});
});
