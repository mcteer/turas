"use client";
import {activeTurn,openInteractions} from 'eve/events';

import { useEveAgent } from "eve/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { DemoDataNotice } from "./demo-data-notice";
import { readChatHandoff } from "./chat-handoff";
import {notifyConversationsUpdated} from './conversation-updates';
import { ChatStatus } from "./chat-status";
import {ChatViewport} from "./chat-viewport";
import {ChatAssistantParts,activityRequestIds,assistantHasContent} from "./chat-activity";
import {ComposerLinks,type ComposerLinksControl} from "./composer-links";
import {ComposerAttachmentMenu} from './composer-attachment-menu';
import { ShareChatClaim } from "./profiles/share-chat-claim";
import { ComposerAttachments } from "./attachments/composer-attachments";
import type { DraftSourceSelection } from "./attachments/source-viewer";
import { ResearchPanel } from "./research/research-panel";
import {pendingChatInputsFromView,chatInputAnswer} from "../../lib/chat-inputs";
import {ChatInputRequestCard} from "./chat-input-request";
import { ChatMarkdown } from "./chat-markdown";
import { backgroundChatActivity } from "../../lib/chat-messages";
import {activeChatHistory,retainedActiveParts,finalChatHistory} from '../../lib/conversations/active-chat-history';
import {RetainedChat} from './retained-chat';
import {retainedChatMessages,type RetainedChatEvent} from '../../lib/conversations/retained-history';
import {nativeUserDisplayParts,type NativeAttachmentReference} from '../../lib/conversations/native-message-display';
import {NativeChatAttachment} from './attachments/native-chat-attachment';
import {OrdinaryDocuments,ReceivedDocuments} from './attachments/ordinary-documents';
import {parseAttachmentMessage} from '../../lib/conversations/attachment-text';

import {composeOrdinaryMessage,splitOrdinaryMessage,type OrdinaryAttachment,type OrdinarySendMessage} from "../../lib/conversations/ordinary-documents";
import {ordinaryNativeMessageSchema,summarizeNativeMessage} from "../../lib/conversations/native-message";
import {uploadNativeFiles,cancelRemovedNativeFiles} from "../../lib/conversations/upload-native-files";

const pendingQuestionFileNotice = 'Answer the pending question separately before sending files or selected evidence.';

function UserChatText({text}:{text:string}) {
  const parsed=parseAttachmentMessage(text);
  return parsed?<>{parsed.prompt&&<p>{parsed.prompt}</p>}<ReceivedDocuments documents={parsed.documents}/></>:<p>{text}</p>;
}

export function AgentChat({ conversationId, nativeSessionId, bindingState,
  customerName, synthetic, csrfToken, customerId, contextStatus, nativeRetired = false, retainedHistory = [], historyTruncated = false, initialMessage }: {
  conversationId: string; nativeSessionId: string | null; bindingState: string;
  customerName: string; synthetic: boolean; csrfToken: string;
  customerId: string | null; contextStatus: "current" | "changed" | "historical";
  initialMessage?:{message:OrdinarySendMessage;requestKey:string;autoSend?:boolean;onConsumed?:()=>void};
  nativeRetired?: boolean; retainedHistory?: RetainedChatEvent[]; historyTruncated?: boolean;
}) {
  const handoff=initialMessage??readChatHandoff(conversationId,csrfToken);
  if (contextStatus !== "current") return <HistoricalChat key={conversationId} conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  if (nativeRetired) return <RetainedChat conversationId={conversationId} customerId={customerId} initialHistory={retainedHistory} initialTruncated={historyTruncated}/>;
  if (!nativeSessionId || bindingState !== "bound") {
    return <main className="chat-page">
      <h1>{customerName}</h1><p role="status">Chat binding is {bindingState}. Reload to check again.</p>
    </main>;
  }
  return <BoundChat key={conversationId} conversationId={conversationId}
    nativeSessionId={nativeSessionId} customerName={customerName}
    synthetic={synthetic} csrfToken={csrfToken} customerId={customerId} initialMessage={handoff} />;
}

function HistoricalChat({ conversationId, customerId, customerName }: {
  conversationId: string; customerId: string | null; customerName: string;
}) {
  const [messages, setMessages] = useState<RetainedChatEvent[]>([]);
  const [ready,setReady]=useState(false);
  useEffect(() => {
    let active = true;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { data: { history: typeof messages } };
      if (active) {setMessages(result.data.history);setReady(true);}
    }).catch(() => undefined);
    return () => { active = false; };
  }, [conversationId]);
  return <main className="chat-page chat-thread"><h1 className="chat-heading">{customerName}</h1>
    <p role="status" className="chat-notice">Customer context has changed. Start a new conversation to use current information.</p>
    <ChatViewport conversationId={conversationId} ready={ready}>{retainedChatMessages(messages,false).map(message => <article className="chat-message" key={message.id}>
      <h2>You</h2>{message.parts.map((part,index)=>part.type==='file'?<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size}/>:<UserChatText key={index} text={part.text}/>)}</article>)}</ChatViewport>
    <p><Link className="primary-button" href={`/s?customerId=${encodeURIComponent(customerId ?? "")}`}>Start a New Conversation</Link></p>
  </main>;
}

function BoundChat({ conversationId, nativeSessionId, customerName, synthetic, csrfToken, customerId, initialMessage }: {
  initialMessage?:{message:OrdinarySendMessage;requestKey:string;autoSend?:boolean;onConsumed?:()=>void};
  conversationId: string; nativeSessionId: string; customerName: string;
  synthetic: boolean; csrfToken: string; customerId: string | null;
}) {
  const search = useSearchParams();
  const [attachmentsOpen, setAttachmentsOpen] = useState(search.get("attachments") === "1");
  const [contextOpen, setContextOpen] = useState(false);
  const [initialDraft, setInitialDraft] = useState<OrdinarySendMessage | null>(initialMessage?.autoSend===false?null:initialMessage?.message??null);
  const initialSent = useRef(false);
  const [draft, setDraft] = useState(initialMessage?.autoSend===false?splitOrdinaryMessage(initialMessage.message).prompt:"");
  const [notice, setNotice] = useState("");
  const clientFailures=useRef(0);
  const noticeEpoch=useRef(0),preparingSend=useRef<symbol|null>(null),responding=useRef<{requestId:string;operation:number}|null>(null),stoppingNow=useRef(false);
  const [historyReady,setHistoryReady]=useState(false);
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
  type FileReference=NativeAttachmentReference;
  const [nativeAttachments,setNativeAttachments]=useState<FileReference[]>([]);
  const [applicationHistory,setApplicationHistory]=useState<RetainedChatEvent[]>([]);
  const [historyTruncated,setHistoryTruncated]=useState(false);
  const historyReadEpoch=useRef(0),historyAppliedEpoch=useRef(0);
  function clearApplicationHistory(epoch:number){if(epoch<historyAppliedEpoch.current)return;historyAppliedEpoch.current=epoch;setApplicationHistory([]);setNativeAttachments([]);setHistoryReady(false);}
  function applyApplicationHistory(data:{contextStatus?:string;history?:RetainedChatEvent[];historyTruncated?:boolean;nativeAttachments?:FileReference[]},epoch:number){
    if(epoch<historyAppliedEpoch.current)return;historyAppliedEpoch.current=epoch;
    setNativeAttachments(data.contextStatus==='current'?data.nativeAttachments??[]:[]);
    setApplicationHistory(data.contextStatus==='current'&&Array.isArray(data.history)?data.history:[]);
    setHistoryTruncated(data.historyTruncated===true);setHistoryReady(true);
  }

  const [documents,setDocuments]=useState<OrdinaryAttachment[]>(initialMessage?.autoSend===false?splitOrdinaryMessage(initialMessage.message).documents:[]);
  const [preparingDocuments,setPreparingDocuments]=useState(false);
  const documentInput=useRef<HTMLInputElement>(null),linkControl=useRef<ComposerLinksControl>(null);
  const [documentsReady,setDocumentsReady]=useState(false);
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
  const keyRef = useRef<string | null>(initialMessage?.requestKey??null);
  const reconnectAttempts=useRef(0);
  const [reconnecting,setReconnecting]=useState(false);
  const agent = useEveAgent({
    initialSession: { sessionId: nativeSessionId, streamIndex: 0 },
    resume: true,
    headers: () => ({ "x-csrf-token": csrfToken,
      "x-turas-conversation-id": conversationId }),
    onError(){clientFailures.current++;},
    onEvent(event) {
      if(event.type==='interaction.settled'&&event.data.interactionId===responding.current?.requestId){
        responding.current=null;setAnswering(false);noticeEpoch.current++;setNotice('');
      }
      if(event.type==='delivery.consumed'||event.type==='model.started'){noticeEpoch.current++;setNotice('');}
      if(event.type==='delivery.consumed')notifyConversationsUpdated();
      if(event.type==='interaction.opened'){
        noticeEpoch.current++;setNotice('');setResponseState('waiting_input');setPendingKey(null);keyRef.current=null;
      }
      if (event.type === "turn.settled") {
        setResponseState(event.data.outcome === "completed" ? "completed"
          : event.data.outcome === "failed" ? "failed" : "cancelled");
        noticeEpoch.current++;setNotice("");
        stoppingNow.current=false;setStopping(false);
        reconnectAttempts.current=0;setReconnecting(false);
        setPendingKey(null);
        keyRef.current = null;
        pendingSelections.current = null;
        pendingMessage.current = null;
      }
    },
  });

  const latestAgent=useRef(agent);latestAgent.current=agent;
  const inputRequests=pendingChatInputsFromView(agent.view);
  const [answering,setAnswering]=useState(false);
  const messages = agent.messages;
  const historyMessages=activeChatHistory(messages,canSteer?applicationHistory:[]);
  const background = backgroundChatActivity(agent.view);
  const displayedRequestIds=new Set(historyMessages.flatMap(item=>activityRequestIds(item.kind==='native'?item.message.parts:item.activity??[])));
  const awaitingAuthorization=openInteractions(agent.view).some(item=>item.request.kind==='sign-in'||item.request.kind==='approval');
  const awaitingUser=inputRequests.length>0||awaitingAuthorization;
  const lastMessage=messages.at(-1);
  const busy=agent.status!=='idle';
  const turnOpen=Boolean(activeTurn(agent.view));
  const stopButton=(turnOpen||busy)&&!(canSteer&&(draft.trim()||documents.length));
  const working=Boolean(activeTurn(agent.view))||busy||background.thinking||Boolean(pendingKey&&['pending','running','stopping'].includes(responseState??''));
  const displayMessages=finalChatHistory(historyMessages,working&&!awaitingUser);
  useEffect(()=>{
    if(!agent.error||denied||stale||latestTurnFailure(agent.events)||reconnectAttempts.current>=3)return;
    setReconnecting(true);
    const timer=setTimeout(()=>{reconnectAttempts.current++;void latestAgent.current.resume().catch(()=>{}).finally(()=>setReconnecting(false));},1000*2**reconnectAttempts.current);
    return ()=>clearTimeout(timer);
  },[agent.status,denied,stale,reconnecting]);


  useEffect(() => {
    let active = true;
    const historyEpoch=++historyReadEpoch.current;
    void fetch(`/api/conversations/${conversationId}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401 || response.status === 404) {
          if (active&&historyEpoch>=historyAppliedEpoch.current) {clearApplicationHistory(historyEpoch);setDenied(true);}
          return;
        }
        if (!response.ok) throw new Error();
        const detail = await response.json() as { data: { history?:RetainedChatEvent[];historyTruncated?:boolean;nativeAttachments?:FileReference[];contextStatus?: string;featureKind?:string;canAttachDocuments?:boolean;canAttachNativeFiles?:boolean; attempts: Array<{
          requestKey: string; dispatchState: string; responseState: string;
          watchdogState: string | null;
        }> } };
        if (!active||historyEpoch<historyAppliedEpoch.current) return;
        setCanSteer(detail.data.featureKind==='normal');
        setCanAttachDocuments(detail.data.canAttachDocuments===true);
        setCanAttachNativeFiles(detail.data.canAttachNativeFiles===true);
        applyApplicationHistory(detail.data,historyEpoch);
        if (detail.data.contextStatus !== "current") {
          setApplicationHistory([]);agent.newSession(); setStale(true); return;
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
              : "");
        } else {
          const latest = detail.data.attempts.at(-1);
          if (latest && ["completed", "cancelled", "failed"].includes(latest.responseState)) {
            setResponseState(latest.responseState);
          }
        }
      }).catch(() => { if (active) {clearApplicationHistory(historyEpoch);setNotice("History status is unavailable. Reload to check again.");} });
    return () => { active = false;historyAppliedEpoch.current=++historyReadEpoch.current; };
  }, [conversationId]);

  useEffect(() => {
    // Access loss/context change is terminal for this mounted live chat.
    // Keep transient failures retryable, but stop polling a denied history.
    if (denied || stale) return;
    let active=true;
    const check = async () => {
      const historyEpoch=++historyReadEpoch.current;
      try {
        const response = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
        if(!active||historyEpoch<historyAppliedEpoch.current)return;
        if (response.status === 401 || response.status === 404) {
          latestAgent.current.newSession();
          clearApplicationHistory(historyEpoch);setDenied(true);
        } else if (response.ok) {
          const detail = await response.json() as { data: { contextStatus?: string;featureKind?:string;canAttachDocuments?:boolean;canAttachNativeFiles?:boolean;history?:RetainedChatEvent[];historyTruncated?:boolean;nativeAttachments?:FileReference[] } };
          if(!active||historyEpoch<historyAppliedEpoch.current)return;
          setCanSteer(detail.data.featureKind==='normal');setCanAttachDocuments(detail.data.canAttachDocuments===true);setCanAttachNativeFiles(detail.data.canAttachNativeFiles===true);
          applyApplicationHistory(detail.data,historyEpoch);
          if (detail.data.contextStatus !== "current") {
            setApplicationHistory([]);latestAgent.current.newSession(); setStale(true);
          }
        } else {clearApplicationHistory(historyEpoch);}
      } catch {if(active)clearApplicationHistory(historyEpoch); /* Never retain a display fallback after its read fails. */ }
    };
    const timer = setInterval(() => { void check(); }, 2_000);
    return () => {active=false;historyAppliedEpoch.current=++historyReadEpoch.current;clearInterval(timer);};
  }, [conversationId, denied, stale]);

  useEffect(() => {
    if (!pendingKey || denied || stale) return;
    let active = true;
    const check = async () => {
      let visibilityHistoryEpoch:number|undefined;
      try {
        const response = await fetch(`/api/conversations/${conversationId}/attempts/${pendingKey}`,
          { cache: "no-store" });
        if (response.status === 401) {
          if (active) { agent.newSession(); setDenied(true);setApplicationHistory([]);setNativeAttachments([]); }
          return;
        }
        if (response.status === 404) {
          // A status read can beat response preparation, or the send can fail
          // before admission. Check chat authority before treating an absent
          // response receipt as lost access. Never redispatch from this poll.
          const historyEpoch=++historyReadEpoch.current;visibilityHistoryEpoch=historyEpoch;
          const visibility = await fetch(`/api/conversations/${conversationId}`, { cache: "no-store" });
          if (!active||historyEpoch<historyAppliedEpoch.current) return;
          if (visibility.status === 401 || visibility.status === 404) {
            clearApplicationHistory(historyEpoch);agent.newSession(); setDenied(true); return;
          }
          if (!visibility.ok) {clearApplicationHistory(historyEpoch);throw new Error();}
          const detail = await visibility.json() as { data: { contextStatus?: string;featureKind?:string;canAttachDocuments?:boolean;canAttachNativeFiles?:boolean;history?:RetainedChatEvent[];historyTruncated?:boolean;nativeAttachments?:FileReference[] } };
          if (!active||historyEpoch<historyAppliedEpoch.current) return;
          applyApplicationHistory(detail.data,historyEpoch);
          if (detail.data.contextStatus !== "current") {
            setApplicationHistory([]);agent.newSession(); setStale(true); return;
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
          stoppingNow.current=false;setStopping(false);
        }
      } catch { if (active) {if(visibilityHistoryEpoch!==undefined)clearApplicationHistory(visibilityHistoryEpoch);setNotice("Status is unavailable. The message was not sent again.");} }
    };
    void check();
    const timer = setInterval(() => { void check(); }, 5_000);
    return () => { active = false; clearInterval(timer); };
  }, [agent, conversationId, denied, stale, pendingKey]);

  useEffect(() => {
    const storageKey = `turas-chat-draft:${conversationId}`;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (!saved) return;
      sessionStorage.removeItem(storageKey);
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
    if (!initialDraft || initialSent.current || agent.status !== "idle" || !historyReady) return;
    initialSent.current = true;
    initialMessage?.onConsumed?.();
    void send(false, initialDraft);
  }, [initialDraft, agent.status,historyReady]);

  async function respondToRequest(response:{requestId:string;optionId?:string;text?:string},onRejected?:()=>void) {
    if(responding.current)return;
    const failuresBefore=clientFailures.current;const operation=++noticeEpoch.current;responding.current={requestId:response.requestId,operation};setAnswering(true);setNotice('Submitting your response…');
    try {
      if(response.optionId!==undefined)await agent.respond([{interactionId:response.requestId,optionId:response.optionId}]);
      else await agent.respond([{interactionId:response.requestId,text:response.text??''}]);
      if(operation===noticeEpoch.current){if(clientFailures.current!==failuresBefore){setNotice('Your response could not be confirmed. Reload to check its status.');onRejected?.();}else setNotice('');}
    }catch{if(operation===noticeEpoch.current){setNotice('Your response could not be confirmed. Reload to check its status.');onRejected?.();}}
    finally{if(responding.current?.operation===operation){responding.current=null;setAnswering(false);}}
  }

  async function send(retryPrepared = false, initialText?: OrdinarySendMessage) {
    if(preparingDocuments||preparingSend.current||responding.current)return;
    const selections = retryPrepared ? pendingSelections.current ?? [] : draftSelections;
    const prompt=draft.trim()||(selections.length?'Please discuss the selected customer source passages.':'');
    let message:OrdinarySendMessage;
    try{message=retryPrepared&&pendingMessage.current?pendingMessage.current:initialText??composeOrdinaryMessage(prompt,documents);}catch(failure){setNotice(failure instanceof Error?failure.message:'The documents could not be prepared.');return;}
    if(typeof message!=='string'&&selections.length){setNotice('Send native files separately from selected source passages.');return;}
    const text=typeof message==='string'?message:summarizeNativeMessage(message);
    if((selections.length||documents.length)&&chatInputAnswer(inputRequests,prompt)){setNotice(pendingQuestionFileNotice);return;}
    const answer=typeof message==='string'&&!selections.length&&!documents.length?chatInputAnswer(inputRequests,text):null;
    if(answer && (agent.status==='idle') && !denied && !answering) {
      const answerDraft=draft;setDraft('');await respondToRequest(answer,()=>setDraft(current=>current||answerDraft));return;
    }
    if(text && canSteer && !denied && !stale && !stopping && !steering && !selections.length &&
      (turnOpen||agent.status==='busy')){
      const preparation=Symbol();preparingSend.current=preparation;const failuresBefore=clientFailures.current;const operation=++noticeEpoch.current;setSteering(true);setNotice('');
      try{message=await uploadNativeFiles(message,conversationId,csrfToken);setDraft('');setDocuments([]);const delivery=agent.send(message,{turnPolicy:'steer',headers:{'x-turas-request-key':crypto.randomUUID()}});setSteering(false);if(preparingSend.current===preparation)preparingSend.current=null;await delivery;if(operation===noticeEpoch.current)setNotice(clientFailures.current!==failuresBefore?'The correction could not be confirmed. It was not sent again.':'');}
      catch{if(operation===noticeEpoch.current)setNotice('The correction could not be confirmed. It was not sent again.');}
      finally{if(preparingSend.current===preparation){preparingSend.current=null;setSteering(false);}}
      return;
    }
    const canDispatch=agent.status==="idle"||Boolean(agent.error)&&((retryPrepared&&dispatchState==="prepared")||(!pendingKey&&["completed","cancelled","failed"].includes(responseState??"")));
    if (!text.trim() || denied || (pendingKey && !(retryPrepared && dispatchState === "prepared")) || !canDispatch) return;
    const preparation=Symbol();preparingSend.current=preparation;setPreparingDocuments(true);
    try { message=await uploadNativeFiles(message,conversationId,csrfToken); }
    catch(error) { if(preparingSend.current===preparation)preparingSend.current=null;setNotice(error instanceof Error?error.message:'File preparation failed.');return; }
    finally { setPreparingDocuments(false); }
    initialMessage?.onConsumed?.();
    const key = keyRef.current ?? crypto.randomUUID();
    keyRef.current = key;
    if (!retryPrepared) pendingSelections.current = selections;
    if (!retryPrepared) pendingMessage.current=message;
    setPendingKey(key);
    setDispatchState("prepared");
    setResponseState("pending");
    const failuresBefore=clientFailures.current;const operation=++noticeEpoch.current;setNotice("");
    setDraft("");
    // agent.send resolves on acceptance. Snapshot and clear only this send’s
    // composer state now, so a correction neither repeats files nor loses a new draft.
    setDraftSelections([]);
    setDocuments([]);
    setSelectionResetVersion((value) => value + 1);
    try {
      const delivery=agent.send(message, { headers: { "x-turas-request-key": key,
        ...(selections.length ? { "x-turas-artifact-selections": btoa(JSON.stringify(selections)) } : {}) } });
      if(preparingSend.current===preparation)preparingSend.current=null;await delivery;
      if(operation===noticeEpoch.current)setNotice(clientFailures.current!==failuresBefore?"Dispatch outcome is being reconciled. The message was not sent again.":"");
    } catch {
      if(operation===noticeEpoch.current)setNotice("Dispatch outcome is being reconciled. The message was not sent again.");
    } finally {if(preparingSend.current===preparation)preparingSend.current=null;}
  }

  async function cancel() {
    if(stoppingNow.current)return;stoppingNow.current=true;const operation=++noticeEpoch.current;setStopping(true);setResponseState("stopping");
    try { const response=await fetch(`/eve/v1/session/${encodeURIComponent(nativeSessionId)}/cancel`,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrfToken,'x-turas-conversation-id':conversationId},body:JSON.stringify({tasks:true})});
      if(!response.ok)await agent.cancel();if(operation===noticeEpoch.current)setNotice("Stopping requested. Waiting for confirmation…"); }
    catch {if(operation===noticeEpoch.current){stoppingNow.current=false;setStopping(false);setResponseState("running");setNotice("Could not request a stop.");}}
  }

  async function sendResearchTurn(turn: { message: string; requestKey: string }) {
    if (denied || stale || pendingKey || agent.status !== "idle") {
      throw new Error("The chat is busy. Check its status before starting research.");
    }
    keyRef.current = turn.requestKey;
    setPendingKey(turn.requestKey);
    setDispatchState("prepared");
    setResponseState("pending");
    setNotice("");
    const failuresBefore=clientFailures.current;const operation=++noticeEpoch.current;try {
      await agent.send(turn.message,{ headers: { "x-turas-request-key": turn.requestKey } });
      if(operation===noticeEpoch.current&&clientFailures.current!==failuresBefore)throw Error("Unconfirmed research delivery");
      if(operation===noticeEpoch.current)setNotice("");
    } catch {
      if(operation===noticeEpoch.current)setNotice("Research dispatch outcome is uncertain. The turn was not sent again.");
      throw new Error("Research dispatch outcome is uncertain. Check status before retrying.");
    }
  }

  if (denied) return <main className="chat-page">
    <h1>Chat Unavailable</h1><p role="alert">Access to this customer or chat has changed.</p>
  </main>;
  if (stale) return <HistoricalChat key={conversationId} conversationId={conversationId}
    customerId={customerId} customerName={customerName} />;
  return <main className="chat-page chat-thread" aria-label={`Chat with Turi: ${customerName}`}>
    {customerId && <><button type="button" className="chat-context-toggle" aria-expanded={contextOpen} disabled={!historyReady}
      onClick={() => setContextOpen(value => !value)}>Customer context</button>
      {contextOpen && <div className="chat-context-details">
        <Link href={`/customers/${customerId}/plans`}>Delivery Plans</Link>
        <DemoDataNotice synthetic={synthetic} />
        {canAttachDocuments && <button type="button" className="secondary-button" aria-expanded={attachmentsOpen}
          onClick={() => setAttachmentsOpen(value => !value)}>Customer sources</button>}
        <ResearchPanel customerId={customerId} conversationId={conversationId}
          csrfToken={csrfToken} busy={Boolean(pendingKey) || agent.status !== "idle"} onStart={sendResearchTurn} />
        <button type="button" className="secondary-button" aria-expanded={shareOpen}
          onClick={() => setShareOpen(value => !value)}>{shareOpen ? "Close claim submission" : "Submit a message claim for review"}</button>
        {shareOpen && <ShareChatClaim conversationId={conversationId} customerId={customerId} csrfToken={csrfToken} />}
      </div>}
    </>}
    <ChatViewport conversationId={conversationId} ready={historyReady&&agent.status!=='resuming'}>
      {historyTruncated&&<p role="status">This conversation is long. Only the first 500 saved events and recent partial responses are shown.</p>}
      {displayMessages.length === 0 && !initialDraft&&!working&&<p className="muted">No messages yet.</p>}
      {initialDraft&&displayMessages.every(item=>item.message.role!=='user')&&<article className="chat-message chat-message-user"><p>{typeof initialDraft==='string'?initialDraft:summarizeNativeMessage(initialDraft)}</p></article>}
      {messages.map(message=>message.role==='assistant'?<ChatAssistantParts key={'inputs:'+message.id} parts={message.parts} activityOnly streaming={busy} requests={inputRequests} disabled={answering||busy} onResponse={respondToRequest}/>:null)}
      {displayMessages.map((item)=>{if(item.kind==='native'&&item.message.role==='assistant'&&!assistantHasContent(item.message.parts,inputRequests))return null;if(item.kind==='retained'){const message=item.message;return <article className={`chat-message chat-message-${message.role}`} aria-label={message.role==='assistant'?'Turi':'You'} key={'retained:'+message.id}> {retainedActiveParts(message,nativeAttachments.find(ref=>ref.eventId===message.id)).map((part,index)=>part.type==='file'?<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size} url={part.url}/>:message.role==='assistant'?<ChatMarkdown key={index} text={part.text}/>:<UserChatText key={index} text={part.text}/>)}{message.partial&&<small>Partial response</small>}</article>;}const message=item.message;return <article className={`chat-message chat-message-${message.role}`}
        aria-label={message.role === "assistant" ? "Turi" : "You"} key={message.id}>
        {message.role==='user'?nativeUserDisplayParts(message,nativeAttachments.find(item=>item.eventId===message.id.replace(/:user$/,''))).map((part,index)=>part.type==='text'
          ?<UserChatText key={index} text={part.text}/>:<NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} url={part.url} size={part.size}/>):<ChatAssistantParts parts={message.parts.filter(part=>part.type==='text'||part.type==='file')} streaming={busy&&lastMessage?.role==='assistant'&&message.metadata?.turnId===lastMessage.metadata?.turnId} requests={inputRequests} disabled={answering||busy} onResponse={respondToRequest}/>}
      </article>;})}
      {inputRequests.filter(request=>!displayedRequestIds.has(request.requestId)).map(request=><ChatInputRequestCard key={request.requestId} request={request}
        disabled={answering||busy} onResponse={respondToRequest}/>) }
      {!awaitingUser&&!latestTurnFailure(agent.events)&&responseState!=='failed'&&responseState!=='cancelled'&&responseState!=='stopping'&&
        (working||reconnecting||Boolean(initialDraft&&!initialSent.current))&&
        (!agent.error||reconnecting)&&<p className="chat-thinking" role="status">Thinking</p>}
    </ChatViewport>
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
      {customerId && attachmentsOpen && <ComposerAttachments conversationId={conversationId} customerId={customerId}
        customerName={customerName} csrfToken={csrfToken}
        onDraftSelectionsChange={setDraftSelections} resetSelectionVersion={selectionResetVersion} />}
     <div className="composer-prompt-row composer-thread-row">
      <ComposerAttachmentMenu disabled={preparingDocuments||stopping||steering}
       onLink={()=>linkControl.current?.open()} onFiles={canAttachDocuments?()=>documentInput.current?.click():undefined}
       filesDisabled={!documentsReady||(!canSteer&&(busy||Boolean(pendingKey)))||answering}
       onSources={customerId?()=>setAttachmentsOpen(value=>!value):undefined}/>
      <textarea id="chat-message" aria-label="Message Turi" rows={1} placeholder="Message Turi…" value={draft} onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }}
        maxLength={16_384} disabled={preparingDocuments || (!canSteer && busy) || (Boolean(pendingKey) && dispatchState !== "prepared" && !(canSteer&&busy)) || stopping || steering} />
        <button className="composer-send" type={stopButton ? "button" : "submit"} aria-label={stopButton ? "Stop response" : "Send message"}
          onClick={stopButton ? () => void cancel() : undefined}
          disabled={preparingDocuments||steering||(stopButton ? stopping||Boolean(draftSelections.length) : (!draft.trim() && !draftSelections.length&&!documents.length) || Boolean(pendingKey) || stopping)}>
          {stopButton ? <span aria-hidden="true">■</span> : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>}
        </button>
     </div>
     <div className="composer-extras">
      <ComposerLinks control={linkControl} hideTrigger text={draft} onChange={setDraft} disabled={preparingDocuments||stopping||steering}/>
      {canAttachDocuments&&<OrdinaryDocuments inputRef={documentInput} hideTrigger onReadyChange={setDocumentsReady} conversationId={conversationId}
        nativeFilesEnabled={canAttachNativeFiles} documents={documents} onChange={next=>void changeDocuments(next)} onPreparingChange={setPreparingDocuments}
        disabled={preparingDocuments||(!canSteer&&(busy||Boolean(pendingKey)))||answering||stopping||steering}/>}
     </div>
    </form>
    {draft.trim() && !pendingKey && <p className="state-message" role="status">Draft not sent.</p>}
    {notice===pendingQuestionFileNotice&&<p role="alert" className="status-alert">{notice}</p>}
    <ChatStatus notice={notice===pendingQuestionFileNotice?undefined:notice} responseState={inputRequests.length?'waiting_input':responseState} error={Boolean(agent.error)&&!reconnecting} quietSuccess errorMessage={latestTurnFailure(agent.events)} />
    {pendingKey && dispatchState === "prepared" && !busy &&
      <button className="secondary-button" type="button" onClick={() => void send(true)}>
        Retry prepared message</button>}

  </main>;
}

function latestTurnFailure(events:ReturnType<typeof useEveAgent>['events']):string|undefined{
 for(let index=events.length-1;index>=0;index--){const event=events[index];
  if(event.type==='session.ended'&&event.data.outcome==='failed')return 'This response stopped before a result could be returned. Your question is saved.';
  if(event.type==='turn.settled'&&event.data.outcome==='failed')return event.data.error?.code==='MODEL_CALL_FAILED'?'The model is temporarily unavailable. Please try again.':event.data.error?.message;
  if(['turn.settled','delivery.consumed'].includes(event.type))return undefined;
 }
}
