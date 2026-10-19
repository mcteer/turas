"use client";
import type {OrdinarySendMessage} from '../../lib/conversations/ordinary-documents';

type Handoff={conversationId:string;csrfToken:string;message:OrdinarySendMessage;requestKey:string;autoSend:boolean};
// One volatile handoff per tab. Nothing is written to browser storage, and a
// different conversation or login cannot consume the draft during navigation.
let pending:Handoff|null=null;
export function stageChatHandoff(value:Handoff){pending=value;}
export function readChatHandoff(conversationId:string,csrfToken:string){
 const value=pending;
 if(!value||value.conversationId!==conversationId||value.csrfToken!==csrfToken)return;
 return {message:value.message,requestKey:value.requestKey,autoSend:value.autoSend,
  onConsumed:()=>{if(pending===value)pending=null;}};
}
