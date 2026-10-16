import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import type {EveMessage} from 'eve/react';
import {ChatAssistantParts,assistantHasContent} from '../../app/_components/chat-activity';
const respond=async()=>{};
const tool={type:'dynamic-tool',toolName:'propose_change',toolCallId:'call',input:{proposal:'Unaccepted'},stepIndex:0} as const;
it('never labels an unsettled approval as a completed tool, even without request metadata',()=>{
 for(const [state,label]of [['approval-requested','Waiting for approval'],['approval-responded','Decision submitted']] as const){
  const parts=[{...tool,state}] as EveMessage['parts'];
  const html=renderToStaticMarkup(<ChatAssistantParts parts={parts} streaming requests={[]} disabled onResponse={respond}/>);
  expect(html).toContain(label);expect(html).not.toContain('Completed');expect(html).not.toContain('Approve');
 }
});
it('keeps completed tools collapsed and hides reasoning once canonical answer prose is available',()=>{
 const parts=[{...tool,state:'output-available',output:{recorded:true}},{type:'reasoning',text:'Internal planning',state:'done',stepIndex:0}] as EveMessage['parts'];
 const html=renderToStaticMarkup(<ChatAssistantParts parts={parts} activityOnly streaming={false} requests={[]} disabled={false} onResponse={respond}/>);
 expect(html).toContain('Completed');expect(html).toContain('Unaccepted');expect(html).not.toContain('Internal planning');expect(html).not.toContain(' open');
});

it('suppresses empty reasoning and expired request shells while preserving real native file output',()=>{
 const empty=[{type:'step-start'},{type:'reasoning',text:'',state:'streaming',stepIndex:0}] as EveMessage['parts'];
 expect(assistantHasContent(empty,[])).toBe(false);
 const file=[{type:'file',filename:'answer.pdf',mediaType:'application/pdf',url:'https://example.com/answer.pdf'}] as EveMessage['parts'];
 expect(assistantHasContent(file,[])).toBe(true);
 const html=renderToStaticMarkup(<ChatAssistantParts parts={file} streaming={false} requests={[]} disabled={false} onResponse={respond}/>);
 expect(html).toContain('answer.pdf');expect(html).toContain('https://example.com/answer.pdf');
});
