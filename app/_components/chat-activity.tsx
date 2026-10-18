"use client";

import type { EveMessage } from "eve/react";
import type { ChatInputRequest } from "../../lib/chat-inputs";
import { getWebUrl } from "../../lib/chat-attachments";
import { ChatInputRequestCard } from "./chat-input-request";
import { ChatMarkdown } from "./chat-markdown";
import { NativeChatAttachment } from "./attachments/native-chat-attachment";

type Part = EveMessage["parts"][number];
type Response = { requestId: string; optionId?: string; text?: string };

function inspection(value: unknown) {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > 32_000 ? text.slice(0, 32_000) + "\n… Preview shortened." : text;
}

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
  const hasText = activityOnly || parts.some(part => part.type === "text" && part.text.trim());
  const activeTool = streaming ? parts.findLastIndex(part => part.type === "dynamic-tool" &&
    ["input-streaming", "input-available", "approval-requested"].includes(part.state)) : -1;
  return parts.map((part, index) => {
    if (part.type === "text") return activityOnly || !part.text ? null : <ChatMarkdown key={index} text={part.text} streaming={streaming&&part.state!=="done"} />;
    if (part.type === "reasoning") return hasText || !part.text ? null : <details className="chat-activity" key={index} open>
      <summary>Thinking</summary><div className="chat-activity-body"><ChatMarkdown text={part.text} streaming={streaming} /></div>
    </details>;
    if(part.type==='file')return <NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size} url={part.url}/>;
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
    // Match legacy: show the current active tool while streaming, then leave
    // completed tools collapsed and inspectable once the response settles.
    if (activeTool >= 0 && index !== activeTool) return null;
    const running = ["input-streaming", "input-available"].includes(part.state);
    const label=part.state==="approval-requested"?"Waiting for approval":part.state==="approval-responded"?"Decision submitted":running?"Running…":part.state==="output-error"?"Failed":"Completed";
    return <details className="chat-activity" key={part.toolCallId}>
      <summary>{part.toolName.replaceAll("_", " ")} <span className="muted">{label}</span></summary>
      <div className="chat-activity-body">
        {part.input !== undefined && <><p>Inputs</p><pre>{inspection(part.input)}</pre></>}
        {part.output !== undefined && <><p>Result</p><pre>{inspection(part.output)}</pre></>}
        {part.errorText && <p role="alert">{part.errorText}</p>}
      </div>
    </details>;
  });
}
