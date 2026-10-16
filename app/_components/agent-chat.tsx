"use client";

import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DemoDataNotice } from "./demo-data-notice";
import { ChatStatus } from "./chat-status";
import { ShareChatClaim } from "./profiles/share-chat-claim";
import { ComposerAttachments } from "./attachments/composer-attachments";
import type { DraftSourceSelection } from "./attachments/source-viewer";
import { ResearchPanel } from "./research/research-panel";
import {pendingChatInputs,chatInputAnswer} from "../../lib/chat-inputs";
import {ChatInputRequestCard} from "./chat-input-request";
import { ChatMarkdown } from "./chat-markdown";
import { visibleChatMessages, backgroundChatActivity } from "../../lib/chat-messages";
import {NativeChatAttachment} from './attachments/native-chat-attachment';
import {OrdinaryDocuments,ReceivedDocuments} from './attachments/ordinary-documents';
import {parseAttachmentMessage} from '../../lib/conversations/attachment-text';

import {composeOrdinaryMessage,splitOrdinaryMessage,type OrdinaryAttachment,type OrdinarySendMessage} from "../../lib/conversations/ordinary-documents";
import {ordinaryNativeMessageSchema,summarizeNativeMessage} from "../../lib/conversations/native-message";
import {uploadNativeFiles,cancelRemovedNativeFiles} from "../../lib/conversations/upload-native-files";

function UserChatText({text}:{text:string}) {
  const parsed=parseAttachmentMessage(text);
  return parsed?<>{parsed.prompt&&<p>{parsed.prompt}</p>}<ReceivedDocuments documents={parsed.documents}/></>:<p>{text}</p>;
}

export function AgentChat({ conversationId, nativeSessionId, bindingState,
  customerName, synthetic, csrfToken, customerId, contextStatus }: {
  conversationId: string; nativeSessionId: string | null; bindingState: string;
  customerName: string; synthetic: boolean; csrfToken: string;
  customerId: string | null; contextStatus: "current" | "changed" | "historical";
}) {
  if (contextStatus !== "current") return <HistoricalChat conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  if (!nativeSessionId || bindingState !== "bound") {
    return <main className="chat-page">
      <h1>{customerName}</h1><p role="status">Chat binding is {bindingState}. Reload to check again.</p>
    </main>;
  }
  return <BoundChat key={conversationId} conversationId={conversationId}
    nativeSessionId={nativeSessionId} customerName={customerName}
    synthetic={synthetic} csrfToken={csrfToken} customerId={customerId} />;
}

function HistoricalChat({ conversationId, customerId, customerName }: {
  conversationId: string; customerId: string | null; customerName: string;
}) {
  const [messages, setMessages] = useState<{ eventId: string; payload: { message?: string;parts?:{type:string;text?:string;filename?:string;mediaType?:string;size?:number}[] } }[]>([]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data: { history: typeof messages } };
      if (active) setMessages(result.data.history);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [conversationId]);
  return <main className="chat-page"><h1 className="chat-heading">{customerName}</h1>
    <p role="status" className="chat-notice">Customer context has changed. Start a new conversation to use current information.</p>
    <div className="chat-messages">{messages.map((event) => <article className="chat-message" key={event.eventId}>
      <h2>You</h2>{event.payload.parts?.some(part=>part.type==='file')?event.payload.parts.map((part,index)=>part.type==='file'?<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size}/>:<UserChatText key={index} text={part.text??''}/>):<UserChatText text={event.payload.message??''}/>}</article>)}</div>
    <p><Link className="primary-button" href={`/s?customerId=${encodeURIComponent(customerId ?? "")}`}>Start a New Conversation</Link></p>
  </main>;
}

function BoundChat({ conversationId, nativeSessionId, customerName, synthetic, csrfToken, customerId }: {
  conversationId: string; nativeSessionId: string; customerName: string;
  synthetic: boolean; csrfToken: string; customerId: string | null;
}) {
  const search = useSearchParams();
  const [attachmentsOpen, setAttachmentsOpen] = useState(search.get("attachments") === "1");
  const [contextOpen, setContextOpen] = useState(false);
  const [initialDraft, setInitialDraft] = useState<OrdinarySendMessage | null>(null);
  const initialSent = useRef(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [denied, setDenied] = useState(false);
  const [stale, setStale] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [draftSelections, setDraftSelections] = useState<DraftSourceSelection[]>([]);
  const [selectionResetVersion, setSelectionResetVersion] = useState(0);
  const pendingSelections = useRef<DraftSourceSelection[] | null>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [dispatchState, setDispatchState] = useState<string>();
  const [responseState, setResponseState] = useState<string>();
  const [canSteer,setCanSteer]=useState(false);
  const [canAttachDocuments,setCanAttachDocuments]=useState(false);
  const [canAttachNativeFiles,setCanAttachNativeFiles]=useState(false);
  type FileReference={eventId:string;files:{filename?:string;mediaType:string;size:number;url:string}[]};
  const [nativeAttachments,setNativeAttachments]=useState<FileReference[]>([]);
  const [documents,setDocuments]=useState<OrdinaryAttachment[]>([]);
  const [preparingDocuments,setPreparingDocuments]=useState(false);
  const changingDocuments=useRef(false);
  const pendingMessage=useRef<OrdinarySendMessage|null>(null);
  const [steering,setSteering]=useState(false);
  async function changeDocuments(next:OrdinaryAttachment[]){
    if(changingDocuments.current)return;
    const removed=documents.some(file=>'sha256' in file&&!next.some(retained=>'data' in retained&&retained.data===file.data));
    if(!removed){setDocuments(next);return;}
    changingDocuments.current=true;setPreparingDocuments(true);
    try{await cancelRemovedNativeFiles(documents,next,conversationId,csrfToken);setDocuments(next);}
    catch(error){setNotice(error instanceof Error?error.message:'File removal could not be confirmed.');}
    finally{changingDocuments.current=false;setPreparingDocuments(false);}
  }
  const keyRef = useRef<string | null>(null);
  const agent = useEveAgent({
    initialSession: { sessionId: nativeSessionId, streamIndex: 0 },
    resume: true,
    headers: () => ({ "x-csrf-token": csrfToken,
      "x-turas-conversation-id": conversationId }),
    onEvent(event) {
      if(event.type==='input.requested'){
        setResponseState('waiting_input');setPendingKey(null);keyRef.current=null;
      }
      if (["turn.completed", "turn.failed", "turn.cancelled"].includes(event.type)) {
        setResponseState(event.type === "turn.completed" ? "completed"
          : event.type === "turn.failed" ? "failed" : "cancelled");
        setStopping(false);
        setPendingKey(null);
        keyRef.current = null;
        pendingSelections.current = null;
        pendingMessage.current = null;
      }
    },
  });

  const inputRequests=pendingChatInputs(agent.events);
  const [answering,setAnswering]=useState(false);
  const messages = visibleChatMessages(agent.data.messages, agent.events);
  const background = backgroundChatActivity(agent.events);
  const messagesPane = useRef<HTMLDivElement>(null);
  const followBottom = useRef(true);
  useEffect(() => {
    const pane = messagesPane.current;
    if (pane && followBottom.current) pane.scrollTop = pane.scrollHeight;
  }, [agent.data.messages, agent.status]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 404) {
          if (active) setDenied(true);
          return;
        }
        if (!response.ok) throw new Error();
        const detail = await response.json() as { data: { nativeAttachments?:FileReference[];contextStatus?: string;featureKind?:string;canAttachDocuments?:boolean;canAttachNativeFiles?:boolean; attempts: Array<{
          requestKey: string; dispatchState: string; responseState: string;
          watchdogState: string | null;
        }> } };
        if (!active) return;
        setCanSteer(detail.data.featureKind==='normal');
        setCanAttachDocuments(detail.data.canAttachDocuments===true);
        setCanAttachNativeFiles(detail.data.canAttachNativeFiles===true);
        setNativeAttachments(detail.data.nativeAttachments??[]);
        if (detail.data.contextStatus !== "current") {
          agent.reset(); setStale(true); return;
        }
        const outstanding = [...detail.data.attempts].reverse().find((attempt) =>
          ["pending", "running", "stopping"].includes(attempt.responseState));
        if (outstanding) {
          keyRef.current = outstanding.requestKey;
          setPendingKey(outstanding.requestKey);
          setDispatchState(outstanding.dispatchState);
          setResponseState(outstanding.responseState);
          setNotice(outstanding.watchdogState === "needs_attention"
            ? "The response could not be confirmed after the deadline. An operator must review this turn before another message is sent."
            : outstanding.dispatchState === "uncertain"
            ? "Dispatch outcome is being reconciled. The message was not sent again."
            : outstanding.dispatchState === "prepared"
              ? "Message was prepared but not dispatched. Re-enter the exact text to retry with its original key."
              : "Restored an active response. Waiting for its terminal status…");
        } else {
          const latest = detail.data.attempts.at(-1);
          if (latest && ["completed", "cancelled", "failed"].includes(latest.responseState)) {
            setResponseState(latest.responseState);
          }
        }
      }).catch(() => { if (active) setNotice("History status is unavailable. Reload to check again."); });
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
        if (response.status === 401 || response.status === 404) {
          agent.reset();
          setDenied(true);
        } else if (response.ok) {
          const detail = await response.json() as { data: { contextStatus?: string;nativeAttachments?:FileReference[] } };
          setNativeAttachments(detail.data.nativeAttachments??[]);
          if (detail.data.contextStatus !== "current") {
            agent.reset(); setStale(true);
          }
        }
      } catch { /* live stream guard also closes on authority failure */ }
    };
    const timer = setInterval(() => { void check(); }, 2_000);
    return () => clearInterval(timer);
  }, [agent, conversationId]);

  useEffect(() => {
    if (!pendingKey || denied) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`/api/conversations/${conversationId}/attempts/${pendingKey}`,
          { cache: "no-store" });
        if (response.status === 401) {
          if (active) { agent.reset(); setDenied(true); }
          return;
        }
        if (response.status === 404) {
          // A status read can beat response preparation, or the send can fail
          // before admission. Check chat authority before treating an absent
          // response receipt as lost access. Never redispatch from this poll.
          const visibility = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
          if (!active) return;
          if (visibility.status === 401 || visibility.status === 404) {
            agent.reset(); setDenied(true); return;
          }
          if (!visibility.ok) throw new Error();
          const detail = await visibility.json() as { data: { contextStatus?: string;nativeAttachments?:FileReference[] } };
          if (!active) return;
          setNativeAttachments(detail.data.nativeAttachments??[]);
          if (detail.data.contextStatus !== "current") {
            agent.reset(); setStale(true); return;
          }
          // Preserve the send's pending/uncertain notice until a receipt exists.
          return;
        }
        if (!response.ok) throw new Error();
        const result = await response.json() as { data: { dispatchState: string;
          responseState: string; watchdogState: string | null } };
        if (!active) return;
        setDispatchState(result.data.dispatchState);
        setResponseState(result.data.responseState);
        if (result.data.watchdogState === "needs_attention") {
          setNotice("The response could not be confirmed after the deadline. An operator must review this turn before another message is sent.");
        } else if (result.data.dispatchState === "uncertain") {
          setNotice("Dispatch outcome is being reconciled. The message was not sent again.");
        } else if (["completed", "cancelled", "failed"].includes(result.data.responseState)) {
          setPendingKey(null);
          keyRef.current = null;
          setStopping(false);
        }
      } catch { if (active) setNotice("Status is unavailable. The message was not sent again."); }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [agent, conversationId, denied, pendingKey]);

  useEffect(() => {
    const storageKey = `turas-chat-draft:${conversationId}`;
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return;
    sessionStorage.removeItem(storageKey);
    try {
      const value = JSON.parse(saved);
      if(typeof value.requestKey!=="string")return;
      const checked=ordinaryNativeMessageSchema.safeParse(value.text);
      const message:OrdinarySendMessage|null=typeof value.text==='string'?value.text:checked.success?checked.data:null;
      if(message===null)return;
      const parsed=splitOrdinaryMessage(message);setDraft(parsed.prompt);
      if(value.autoSend===false)setDocuments(parsed.documents);
      else { keyRef.current = value.requestKey; setInitialDraft(message); }
    } catch { /* A corrupt local draft cannot dispatch a turn. */ }
  }, [conversationId]);

  useEffect(() => {
    if (!initialDraft || initialSent.current || agent.status !== "ready") return;
    initialSent.current = true;
    void send(false, initialDraft);
  }, [initialDraft, agent.status]);

  async function respondToRequest(response:{requestId:string;optionId?:string;text?:string}) {
    setAnswering(true);setNotice('Submitting your response…');
    try {
      if(response.optionId!==undefined)await agent.respond([{requestId:response.requestId,optionId:response.optionId}]);
      else await agent.respond([{requestId:response.requestId,text:response.text??''}]);
      setNotice('Response submitted.');
    }catch{setNotice('Your response could not be confirmed. Reload to check its status.');}
    finally{setAnswering(false);}
  }

  async function send(retryPrepared = false, initialText?: OrdinarySendMessage) {
    if(preparingDocuments)return;
    const selections = retryPrepared ? pendingSelections.current ?? [] : draftSelections;
    const prompt=draft.trim()||(selections.length?'Please discuss the selected customer source passages.':'');
    let message:OrdinarySendMessage;
    try{message=retryPrepared&&pendingMessage.current?pendingMessage.current:initialText??composeOrdinaryMessage(prompt,documents);}catch(failure){setNotice(failure instanceof Error?failure.message:'The documents could not be prepared.');return;}
    if(typeof message!=='string'&&selections.length){setNotice('Send native files separately from selected source passages.');return;}
    const text=typeof message==='string'?message:summarizeNativeMessage(message);
    if((selections.length||documents.length)&&chatInputAnswer(inputRequests,prompt)){setNotice('Answer the pending question separately before sending files or selected evidence.');return;}
    const answer=typeof message==='string'&&!selections.length&&!documents.length?chatInputAnswer(inputRequests,text):null;
    if(answer && agent.status==='ready' && !denied && !answering) {
      await respondToRequest(answer);setDraft('');return;
    }
    if(text && canSteer && !denied && !stale && !stopping && !steering && !selections.length &&
      (agent.status==='submitted'||agent.status==='streaming')){
      setSteering(true);setNotice('Sending correction…');
      try{message=await uploadNativeFiles(message,conversationId,csrfToken);setDraft('');setDocuments([]);const delivery=agent.send(message,{turnPolicy:'steer',headers:{'x-turas-request-key':crypto.randomUUID()}});setSteering(false);await delivery;setNotice('Correction submitted.');}
      catch{setNotice('The correction could not be confirmed. It was not sent again.');}
      finally{setSteering(false);}
      return;
    }
    if (!text.trim() || denied || (pendingKey && !(retryPrepared && dispatchState === "prepared")) ||
        agent.status !== "ready") return;
    setPreparingDocuments(true);
    try { message=await uploadNativeFiles(message,conversationId,csrfToken); }
    catch(error) { setNotice(error instanceof Error?error.message:'File preparation failed.');return; }
    finally { setPreparingDocuments(false); }
    const key = keyRef.current ?? crypto.randomUUID();
    keyRef.current = key;
    if (!retryPrepared) pendingSelections.current = selections;
    if (!retryPrepared) pendingMessage.current=message;
    setPendingKey(key);
    setDispatchState("prepared");
    setResponseState("pending");
    setNotice("Submitting message…");
    setDraft("");
    // agent.send resolves after streaming. Snapshot and clear only this send’s
    // composer state now, so a correction neither repeats files nor loses a new draft.
    setDraftSelections([]);
    setDocuments([]);
    setSelectionResetVersion((value) => value + 1);
    try {
      await agent.send(message, { headers: { "x-turas-request-key": key,
        ...(selections.length ? { "x-turas-artifact-selections": btoa(JSON.stringify(selections)) } : {}) } });
      setNotice("Message accepted. Waiting for the response…");
    } catch {
      setNotice("Dispatch outcome is being reconciled. The message was not sent again.");
    }
  }

  async function cancel() {
    setStopping(true);
    try { const response=await fetch(`/eve/v1/session/${encodeURIComponent(nativeSessionId)}/cancel`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken,'x-turas-conversation-id':conversationId},body:JSON.stringify({tasks:true})});
      if(!response.ok)await agent.cancel();setNotice("Stopping requested. Waiting for confirmation…"); }
    catch { setStopping(false); setNotice("Could not request a stop."); }
  }

  async function sendResearchTurn(turn: { message: string; requestKey: string }) {
    if (denied || stale || pendingKey || agent.status !== "ready") {
      throw new Error("The chat is busy. Check its status before starting research.");
    }
    keyRef.current = turn.requestKey;
    setPendingKey(turn.requestKey);
    setDispatchState("prepared");
    setResponseState("pending");
    setNotice("Submitting research turn…");
    try {
      await agent.send(turn.message,{ headers: { "x-turas-request-key": turn.requestKey } });
      setNotice("Research turn accepted. Waiting for the response…");
    } catch {
      setNotice("Research dispatch outcome is uncertain. The turn was not sent again.");
      throw new Error("Research dispatch outcome is uncertain. Check status before retrying.");
    }
  }

  if (denied) return <main className="chat-page">
    <h1>Chat Unavailable</h1><p role="alert">Access to this customer or chat has changed.</p>
  </main>;
  if (stale) return <HistoricalChat conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  const busy = agent.status === "submitted" || agent.status === "streaming";
  return <main className="chat-page chat-thread" aria-label={`Chat with Turi: ${customerName}`}>
    {customerId && <><button type="button" className="chat-context-toggle" aria-expanded={contextOpen}
      onClick={() => setContextOpen(value => !value)}>Customer context</button>
      {contextOpen && <div className="chat-context-details">
        <Link href={`/customers/${customerId}/plans`}>Delivery Plans</Link>
        <DemoDataNotice synthetic={synthetic} />
        {canAttachDocuments && <button type="button" className="secondary-button" aria-expanded={attachmentsOpen}
          onClick={() => setAttachmentsOpen(value => !value)}>Customer sources</button>}
        <ResearchPanel customerId={customerId} conversationId={conversationId}
          csrfToken={csrfToken} busy={Boolean(pendingKey) || agent.status !== "ready"} onStart={sendResearchTurn} />
        <button type="button" className="secondary-button" aria-expanded={shareOpen}
          onClick={() => setShareOpen(value => !value)}>{shareOpen ? "Close claim submission" : "Submit a message claim for review"}</button>
        {shareOpen && <ShareChatClaim conversationId={conversationId} customerId={customerId} csrfToken={csrfToken} />}
      </div>}
    </>}
    <div className="chat-messages" ref={messagesPane} tabIndex={0} role="region" aria-label="Conversation messages" aria-live="polite" onScroll={() => {
      const pane = messagesPane.current;
      if (pane) followBottom.current = pane.scrollHeight - pane.scrollTop - pane.clientHeight < 80;
    }}>
      {messages.length === 0 && <p className="muted">No messages yet.</p>}
      {messages.map((message) => <article className={`chat-message chat-message-${message.role}`}
        aria-label={message.role === "assistant" ? "Turi" : "You"} key={message.id}>
        {message.parts.map((part, index) => part.type === "text"
          ? message.role === "assistant"
            ? <ChatMarkdown key={index} streaming={busy && message.id === messages.at(-1)?.id} text={part.text} />
            : <UserChatText key={index} text={part.text}/>
          : part.type==='file'&&message.role==='user'?<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} url={part.url} {...nativeAttachments.find(item=>item.eventId===message.id.replace(/:user$/,''))?.files.find(file=>file.filename===part.filename&&file.mediaType===part.mediaType)}/>:null)}
      </article>)}
      {inputRequests.map(request=><ChatInputRequestCard key={request.requestId} request={request}
        disabled={answering||busy||agent.status==='resuming'} onResponse={respondToRequest}/>) }
      {(busy || background.thinking) && <p className="chat-thinking" role="status">
        {background.thinking ? "Researching…" : "Thinking…"}</p>}
    </div>
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      {customerId && attachmentsOpen && <ComposerAttachments conversationId={conversationId} customerId={customerId}
        customerName={customerName} csrfToken={csrfToken}
        onDraftSelectionsChange={setDraftSelections} resetSelectionVersion={selectionResetVersion} />}
      <textarea id="chat-message" aria-label="Message Turi" placeholder="Message Turi…" value={draft} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
        maxLength={16_384} disabled={preparingDocuments || (!canSteer && busy) || (Boolean(pendingKey) && dispatchState !== "prepared" && !(canSteer&&busy)) || agent.status === "resuming" || stopping || steering} />
      <div className="chat-actions">
        {canAttachDocuments&&<OrdinaryDocuments conversationId={conversationId} nativeFilesEnabled={canAttachNativeFiles} documents={documents} onChange={next=>void changeDocuments(next)} onPreparingChange={setPreparingDocuments}
          disabled={preparingDocuments||(!canSteer&&(busy||Boolean(pendingKey)))||answering||agent.status==='resuming'||stopping||steering}/>}
        {customerId && !canAttachDocuments && <button className="composer-attach" type="button" aria-label="Show attachments" aria-expanded={attachmentsOpen}
          onClick={() => setAttachmentsOpen(value => !value)}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" /></svg></button>}
        <button className="composer-send" type={busy && !(canSteer&&(draft.trim()||documents.length)) ? "button" : "submit"} aria-label={busy && !(canSteer&&(draft.trim()||documents.length)) ? "Stop response" : "Send message"}
          onClick={busy && !(canSteer&&(draft.trim()||documents.length)) ? () => void cancel() : undefined}
          disabled={preparingDocuments||(busy ? stopping||steering||Boolean(draftSelections.length) : (!draft.trim() && !draftSelections.length&&!documents.length) || Boolean(pendingKey) || agent.status === "resuming" || stopping)}>
          {busy && !(canSteer&&(draft.trim()||documents.length)) ? <span aria-hidden="true">■</span> : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </button>
      </div>
    </form>
    {draft.trim() && !pendingKey && <p className="state-message" role="status">Draft not sent.</p>}
    {notice==='Answer the pending question separately before sending files or selected evidence.'&&<p role="alert" className="status-alert">{notice}</p>}
    <ChatStatus notice={notice} responseState={inputRequests.length?'waiting_input':responseState} error={Boolean(agent.error)} />
    {pendingKey && dispatchState === "prepared" && !busy &&
      <button className="secondary-button" type="button" onClick={() => void send(true)}>
        Retry prepared message</button>}
    {pendingKey && <button className="secondary-button" type="button" onClick={() => {
      void fetch(`/api/conversations/${conversationId}/attempts/${pendingKey}`, { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          const status = await response.json() as { data: { dispatchState: string; responseState: string } };
          setResponseState(status.data.responseState);
          setNotice(`Dispatch: ${status.data.dispatchState}. Response: ${status.data.responseState}.`);
        }).catch(() => setNotice("Status is unavailable."));
    }}>Check status</button>}
  </main>;
}
