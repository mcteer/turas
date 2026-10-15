import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "../../app/_components/chat-markdown";
import { titleFromMessage } from "../../lib/conversations/title";
import { visibleChatMessages,backgroundChatActivity } from "../../lib/chat-messages";
import type { EveMessage } from "eve/react";
import type { MessageStreamEvent } from "eve/client";

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
