import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import type {EveMessage} from 'eve/react';
import {ChatAssistantParts,assistantHasContent} from '../../app/_components/chat-activity';
const respond=async()=>{};
const tool={type:'tool',kind:'tool',name:'propose_change',label:'Propose change',callId:'call',input:{proposal:'Unaccepted'},stepIndex:0} as const;
it('never exposes approval without the exact proposed input',()=>{
 const interaction={interactionId:'approval',turnId:'turn',stepIndex:0,status:'open' as const,request:{kind:'approval' as const,prompt:'Approve this proposal?',options:[{id:'approve',label:'Approve'}]}};
 const parts=[{...tool,state:'blocked',interaction}] as EveMessage['parts'];
 const request={requestId:'approval',kind:'tool-approval' as const,prompt:'Approve this proposal?',options:[{id:'approve',label:'Approve'}]};
 const html=renderToStaticMarkup(<ChatAssistantParts parts={parts} streaming requests={[request]} disabled onResponse={respond}/>);
 expect(html).toContain('exact proposed inputs are unavailable');expect(html).toContain('disabled');expect(html).not.toContain('Completed');
});
it('keeps ordinary completed tools and reasoning in the background',()=>{
 const parts=[{...tool,state:'completed',output:{recorded:true}},{type:'reasoning',text:'Internal planning',state:'done',stepIndex:0}] as EveMessage['parts'];
 const html=renderToStaticMarkup(<ChatAssistantParts parts={parts} activityOnly streaming={false} requests={[]} disabled={false} onResponse={respond}/>);
 expect(html).toBe('');
 const reasoningOnly=renderToStaticMarkup(<ChatAssistantParts parts={parts.slice(1)} streaming requests={[]} disabled={false} onResponse={respond}/>);expect(reasoningOnly).toBe('');
});

it('suppresses empty reasoning and expired request shells while preserving real native file output',()=>{
 const empty=[{type:'reasoning',text:'',state:'streaming',stepIndex:0}] as EveMessage['parts'];
 expect(assistantHasContent(empty,[])).toBe(false);
 const file=[{type:'file',filename:'answer.pdf',mediaType:'application/pdf',url:'https://example.com/answer.pdf'}] as EveMessage['parts'];
 expect(assistantHasContent(file,[])).toBe(true);
 const html=renderToStaticMarkup(<ChatAssistantParts parts={file} streaming={false} requests={[]} disabled={false} onResponse={respond}/>);
 expect(html).toContain('answer.pdf');expect(html).toContain('https://example.com/answer.pdf');
});
