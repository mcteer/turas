"use client";

import type { EveMessage } from "eve/react";
import type { ChatInputRequest } from "../../lib/chat-inputs";
import { getWebUrl } from "../../lib/chat-attachments";
import { ChatInputRequestCard } from "./chat-input-request";
import { ChatMarkdown } from "./chat-markdown";
import { NativeChatAttachment } from "./attachments/native-chat-attachment";

type Part = EveMessage["parts"][number];
type Response = { requestId: string; optionId?: string; text?: string };

export function activityRequestIds(parts: readonly Part[]) {
  return parts.flatMap(part => part.type === "dynamic-tool" && part.toolMetadata?.eve?.inputRequest
    ? [part.toolMetadata.eve.inputRequest.requestId] : []);
}

export function assistantHasContent(parts:readonly Part[],requests:readonly ChatInputRequest[]){
  const hasText=parts.some(part=>part.type==='text'&&part.text.trim());
  return parts.some(part=>{
    if(part.type==='text')return Boolean(part.text.trim());
    if(part.type==='reasoning')return !hasText&&Boolean(part.text.trim());
    if(part.type==='file'||part.type==='authorization')return true;
    if(part.type!=='dynamic-tool')return false;
    const request=part.toolMetadata?.eve?.inputRequest;
    return !request||Boolean(part.toolMetadata?.eve?.inputResponse)||requests.some(pending=>pending.requestId===request.requestId);
  });
}

/** Current authorized SDK projection only; never used to admit or replay work. */
export function ChatAssistantParts({ parts, streaming, requests, disabled, onResponse, activityOnly = false }: {
  parts: readonly Part[]; streaming: boolean; requests: readonly ChatInputRequest[];
  disabled: boolean; onResponse: (response: Response) => Promise<void>; activityOnly?: boolean;
}) {
  return parts.map((part, index) => {
    if (part.type === "text") return activityOnly || !part.text ? null : <ChatMarkdown key={index} text={part.text} streaming={streaming&&part.state!=="done"} />;
    if (part.type === "reasoning") return null;
    if(part.type==='file')return activityOnly?null:<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size} url={part.url}/>;
    if (part.type === "authorization") {
      const url = part.authorization?.url ? getWebUrl(part.authorization.url) : undefined;
      return <section className="chat-input-request" aria-label={`${part.displayName} authorization`} key={index}>
        <p>{part.state === "completed" ? `${part.displayName} authorization ${part.outcome}.` : part.description}</p>
        {part.state !== "completed" && <>
          {part.authorization?.instructions && part.authorization.instructions !== part.description && <p>{part.authorization.instructions}</p>}
          {part.authorization?.userCode && <code>{part.authorization.userCode}</code>}
          {url && <a href={url.href} target="_blank" rel="noopener noreferrer">Sign in with {part.displayName}</a>}
        </>}
      </section>;
    }
    if (part.type !== "dynamic-tool") return null;
    const input = part.toolMetadata?.eve?.inputRequest;
    if (input) {
      const pending = requests.find(request => request.requestId === input.requestId);
      if (pending) return <ChatInputRequestCard key={input.requestId} request={pending} disabled={disabled} onResponse={onResponse} />;
      const response = part.toolMetadata?.eve?.inputResponse;
      if (response) return <section className="chat-input-request chat-input-resolved" aria-label="Submitted response" key={input.requestId}>
        <p>{input.prompt}</p><p className="muted">{response.optionId
          ? input.options?.find(option => option.id === response.optionId)?.label ?? response.optionId
          : response.text}</p><small>Response submitted</small>
      </section>;
      return null;
    }
    if(part.state==='approval-requested'||part.state==='approval-responded')return <p className="chat-notice" role="status" key={part.toolCallId}>
      {part.state==='approval-requested'?'Waiting for approval':'Decision submitted'}</p>;
    // Ordinary tools and model reasoning run in the background. Explicit
    // questions and authorization above remain actionable.
    return null;
  });
}
