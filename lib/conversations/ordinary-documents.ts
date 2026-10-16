import {attachmentLimits,formatAttachmentText,parseAttachmentMessage,type AttachedDocumentText} from './attachment-text';
import {hydratedNativeMessageSchema,type OrdinaryNativeFile,type OrdinaryNativeMessage} from './native-message';
export type OrdinaryAttachment=AttachedDocumentText|OrdinaryNativeFile;
export type OrdinarySendMessage=string|OrdinaryNativeMessage;
export function composeOrdinaryMessage(prompt:string,documents:readonly OrdinaryAttachment[]):OrdinarySendMessage{
 if(new TextEncoder().encode(prompt).byteLength>16384)throw Error('Shorten the message text before sending.');
 if(documents.length>attachmentLimits.files)throw Error('Attach up to five documents per message.');
 if(!documents.length)return prompt.trim();
 const text=prompt.trim()||'Please discuss the attached documents.';
 const extracted=documents.filter((document):document is AttachedDocumentText=>!('data' in document));
 if(extracted.length===documents.length)return [text,...extracted.map(document=>formatAttachmentText(document.filename,document.mediaType,document.text,document.truncated))].join('\n\n');
 const parts=[{type:'text' as const,text},...documents.map(document=>'data' in document?document:{type:'text' as const,text:formatAttachmentText(document.filename,document.mediaType,document.text,document.truncated)})];
 const parsed=hydratedNativeMessageSchema.safeParse(parts);
 if(!parsed.success)throw Error('These files exceed the native message limit. Remove an attachment or use a smaller file.');
 return parsed.data;
}
export function splitOrdinaryMessage(message:OrdinarySendMessage):{prompt:string;documents:OrdinaryAttachment[]}{
 if(typeof message==='string'){const parsed=parseAttachmentMessage(message);return parsed??{prompt:message,documents:[]};}
 const prompts:string[]=[],documents:OrdinaryAttachment[]=[];
 for(const part of message){
  if(part.type==='file'){documents.push(part);continue;}
  const parsed=parseAttachmentMessage(part.text);
  if(parsed){if(parsed.prompt)prompts.push(parsed.prompt);documents.push(...parsed.documents);}else prompts.push(part.text);
 }
 return {prompt:prompts.join('\n'),documents};
}
