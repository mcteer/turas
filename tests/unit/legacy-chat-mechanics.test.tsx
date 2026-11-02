import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatMarkdown } from "../../app/_components/chat-markdown";
import { titleFromMessage } from "../../lib/conversations/title";
import type { EveMessage } from "eve/react";
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
