import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "../../app/_components/chat-markdown";
import { titleFromMessage } from "../../lib/conversations/title";
import { visibleChatMessages,backgroundChatActivity } from "../../lib/chat-messages";
import type { EveMessage } from "eve/react";
import type { MessageStreamEvent } from "eve/client";
import {nativeUserDisplayParts,type NativeAttachmentReference} from "../../lib/conversations/native-message-display";

describe("restored legacy chat mechanics", () => {
  it("renders headings, lists, emphasis and source links as Markdown", () => {
    const html = renderToStaticMarkup(<ChatMarkdown text={"## Products\n\n- **Sandbox**: [source](https://vercel.com/customers)\n\n`example`"} />);
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("<strong");
    expect(html).toContain('href="https://vercel.com/customers"');
    expect(html).toContain("<code");
  });
  it("uses the first message as a bounded readable thread title", () => {
    expect(titleFromMessage("  Which\n  products does Baggu use?  ")).toBe("Which products does Baggu use?");
    expect(titleFromMessage("x".repeat(90))).toHaveLength(80);
  });
  it("keeps a real user delivery that quotes a background task notice", () => {
    const message = {id:"m",role:"user",parts:[{type:"text",text:"Background task t (customer-recon) is completed."}],metadata:{turnId:"turn"}} as EveMessage;
    const events = [
      {type:"subagent.completed",data:{subagentName:"customer-recon",backgroundTask:{taskId:"t"}},meta:{}},
      {type:"message.received",data:{turnId:"turn",message:message.parts[0].type === "text" ? message.parts[0].text : ""},meta:{deliveryIds:["delivery"]}},
    ] as unknown as MessageStreamEvent[];
    expect(visibleChatMessages([message],events)).toEqual([message]);
    events[1] = {...events[1],meta:{...events[1].meta,deliveryIds:[]}} as MessageStreamEvent;
    expect(visibleChatMessages([message],events)).toEqual([]);
  });
  it("recognizes current Eve specialist working receipts before their notification turn",()=>{
    const events=[{type:"action.result",data:{result:{toolName:"customer-recon",output:{status:"working",taskId:"t"}}},
      meta:{id:"e",at:"2026-10-14T00:00:00.000Z"}}] as unknown as MessageStreamEvent[];
    expect(backgroundChatActivity(events,Date.parse("2026-10-14T00:01:00.000Z")).thinking).toBe(true);
    const message={id:"m",role:"user",metadata:{turnId:"wake"},parts:[{type:"text",text:"Background task t (customer-recon) is completed."}]} as EveMessage;
    events.push({type:"message.received",data:{turnId:"wake",message:"Background task t (customer-recon) is completed."},meta:{id:"received",at:"2026-10-14T00:01:00.000Z"}} as MessageStreamEvent);
    expect(visibleChatMessages([message],events)).toEqual([]);
  });
});

it('hides native task-state wakeups and settles the current workflow receipt',()=>{
 const events=[{type:'action.result',data:{result:{callId:'call',toolName:'customer-recon',output:{status:'working',taskId:'task'}}},meta:{at:'2026-10-14T00:00:00Z'}},
  {type:'message.received',data:{kind:'execution.background_task',turnId:'wake',message:'[Task state] runtime cohort'},meta:{deliveryIds:[]}},
  {type:'action.result',data:{result:{callId:'call',toolName:'customer-recon',output:{kind:'customer-update',status:'ready'}}},meta:{at:'2026-10-14T00:01:00Z'}}] as unknown as MessageStreamEvent[];
 const message={id:'wake',role:'user',metadata:{turnId:'wake'},parts:[{type:'text',text:'[Task state] runtime cohort'}]} as EveMessage;
 expect(visibleChatMessages([message],events)).toEqual([]);
 expect(backgroundChatActivity(events,Date.parse('2026-10-14T00:02:00Z')).thinking).toBe(false);
});

it('places corrected answer steps after their actual user delivery while keeping earlier streamed text',()=>{
 const user=(id:string,text:string)=>({id:id+':user',role:'user',metadata:{turnId:'turn'},parts:[{type:'text',text}]} as EveMessage);
 const first=user('evt_first','Original question'),correction=user('evt_correction','Correction');
 const assistant={id:'assistant',role:'assistant',metadata:{turnId:'turn'},parts:[{type:'text',stepIndex:0,text:'Earlier streamed text'},{type:'text',stepIndex:1,text:'Corrected answer'}]} as EveMessage;
 const events=[{type:'message.received',data:{turnId:'turn',message:'Original question'},meta:{id:'evt_first'}},
  {type:'step.started',data:{turnId:'turn',stepIndex:0},meta:{}},
  {type:'message.received',data:{turnId:'turn',message:'Correction'},meta:{id:'evt_correction'}},
  {type:'step.started',data:{turnId:'turn',stepIndex:1},meta:{}}] as unknown as MessageStreamEvent[];
 const texts=visibleChatMessages([first,assistant,correction],events).map(message=>message.parts.filter(part=>part.type==='text').map(part=>part.text).join(''));
 expect(texts).toEqual(['Original question','Earlier streamed text','Correction','Corrected answer']);
 expect(visibleChatMessages([first,{...assistant,parts:assistant.parts.slice(1)},correction],events).map(message=>message.role)).toEqual(['user','user','assistant']);
});


it("folds interrupted-step delivery aliases without hiding separate or changed inputs", () => {
  const user = (id: string) => ({ id: `${id}:user`, role: "user", parts: [{ type: "text", text: "Question" }] } as EveMessage);
  const received = (id: string, delivery = "delivery", sequence = 0, message = "Question") => ({
    type: "message.received", data: { turnId: "turn", sequence, message },
    meta: { id, deliveryIds: [delivery] },
  } as MessageStreamEvent);
  const first = user("first"), retry = user("retry");
  const events = [received("first"), received("retry")];
  expect(visibleChatMessages([first, retry], events)).toEqual([first]);
  expect(visibleChatMessages([retry], events)).toEqual([retry]);
  expect(visibleChatMessages([first], [events[0], events[0]])).toEqual([first]);
  for (const different of [received("retry", "other"), received("retry", "delivery", 1), received("retry", "delivery", 0, "Changed")])
    expect(visibleChatMessages([first, retry], [events[0], different])).toEqual([first, retry]);
  const changedParts = { ...events[1], data: { ...events[1].data, parts: [{ type: "file", mediaType: "image/png", filename: "changed.png" }] } } as MessageStreamEvent;
  expect(visibleChatMessages([first, retry], [events[0], changedParts])).toEqual([first, retry]);
  const missingDelivery = { ...events[1], meta: { ...events[1].meta, deliveryIds: [] } } as MessageStreamEvent;
  expect(visibleChatMessages([first, retry], [events[0], missingDelivery])).toEqual([first, retry]);
});


it("presents staged native summaries as original text and owned attachment cards",()=>{
 const message={id:'event:user',role:'user',parts:[{type:'text',text:'Question\n[file: image.png (image/png)]'}]} as EveMessage;
 const reference:NativeAttachmentReference={eventId:'event',text:'Question',inlineFileCount:0,fileOrder:[{kind:'staged',index:0}],files:[{filename:'image.png',mediaType:'image/png',size:10485760,url:'/api/conversations/owned/native-uploads/exact'}]};
 expect(nativeUserDisplayParts(message,reference)).toEqual([{type:'text',text:'Question'},{type:'file',...reference.files[0]}]);
 expect(nativeUserDisplayParts(message)).toEqual(message.parts);
 expect(nativeUserDisplayParts(message,{...reference,fileOrder:[{kind:'staged',index:3}]})).toEqual(message.parts);
});
it("preserves mixed file order and distinct inline bytes with identical names",()=>{
 const inline={type:'file',filename:'same.png',mediaType:'image/png',url:'data:image/png;base64,inline'} as const;
 const reference:NativeAttachmentReference={eventId:'event',text:'Compare',inlineFileCount:1,fileOrder:[{kind:'staged',index:0},{kind:'inline',index:0}],files:[{filename:'same.png',mediaType:'image/png',size:10,url:'/api/conversations/owned/native-uploads/staged'}]};
 const message={id:'event:user',role:'user',parts:[{type:'text',text:'Compare\n[file: same.png (image/png)]'},inline]} as EveMessage;
 expect(nativeUserDisplayParts(message,reference)).toEqual([{type:'text',text:'Compare'},{type:'file',...reference.files[0]},inline]);
});
it("uses canonical owned staged links for older native histories without duplicating files",()=>{
 const reference:NativeAttachmentReference={eventId:'event',text:'Question',inlineFileCount:0,fileOrder:[{kind:'staged',index:0}],files:[{filename:'image.png',mediaType:'image/png',size:42,url:'/api/conversations/owned/native-uploads/exact'}]};
 const message={id:'event:user',role:'user',parts:[{type:'text',text:'Question'},{type:'file',filename:'image.png',mediaType:'image/png',url:'https://example.com/old-native-file'}]} as EveMessage;
 expect(nativeUserDisplayParts(message,reference)).toEqual([{type:'text',text:'Question'},{type:'file',...reference.files[0]}]);
});
