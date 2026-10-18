"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import { OrdinaryDocuments } from "./attachments/ordinary-documents";
import {composeOrdinaryMessage,type OrdinaryAttachment,type OrdinarySendMessage} from "../../lib/conversations/ordinary-documents";
import {ComposerLinks} from "./composer-links";
import { CustomerPicker, type CustomerChoice } from "./customer-picker";
import { stageChatHandoff } from "./chat-handoff";
import { uploadNativeFiles } from "../../lib/conversations/upload-native-files";


export function NewConversation({ csrfToken, canAttachDocuments = false, canAttachNativeFiles = false }: { csrfToken: string; canAttachDocuments?: boolean; canAttachNativeFiles?: boolean }) {
  const search = useSearchParams();
  const pathname=usePathname();
  const router=useRouter();
  const [customers, setCustomers] = useState<CustomerChoice[]>([]);
  const [selected, setSelected] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "creating" | "unavailable">("loading");
  const [error, setError] = useState("");
  const starting = useRef(false);
  const operation = useRef<string | null>(null);
  const [draft, setDraft] = useState("");
  const [documents,setDocuments]=useState<OrdinaryAttachment[]>([]);
  const [preparingDocuments,setPreparingDocuments]=useState(false);

  useEffect(() => {
    let active = true;
    void fetch("/api/customers", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error();
      const body = await response.json() as { data: { items: CustomerChoice[] } };
      if (!active) return;
      setCustomers(body.data.items);
      const requested = search.get("customerId");
      if (requested && body.data.items.some((customer) => customer.id === requested)) setSelected(requested);
      if (!starting.current) setState("ready");
    }).catch(() => { if (active && !starting.current) setState("unavailable"); });
    return () => { active = false; };
  }, [search]);

  async function start(attachments = false) {
    if ((!draft.trim() && !documents.length && !attachments) || starting.current || preparingDocuments) return;
    let text:OrdinarySendMessage;
    try{text=composeOrdinaryMessage(draft,documents);}catch(failure){setError(failure instanceof Error?failure.message:'The documents could not be prepared.');return;}
    starting.current = true;
    setState("creating");
    setError("");
    const operationId = operation.current ?? crypto.randomUUID();
    operation.current = operationId;
    try {
      const created = await fetch("/api/conversations", {
        method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ customerId: selected || null, requestKey: operationId }),
      });
      if (!created.ok) throw new Error(created.status === 404 ? "Customer access changed." : "Could not create chat.");
      const result = await created.json() as { data: { id: string } };
      let sessionId: string | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        const native = await fetch("/eve/v1/session", {
          method: "POST", headers: { "content-type": "application/json",
            "x-csrf-token": csrfToken, "x-turas-conversation-id": result.data.id },
          body: JSON.stringify({ operationId }),
        });
        if (native.ok) { const data=await native.json() as {sessionId:string}; if(typeof data.sessionId!=="string"||!data.sessionId)throw Error("Chat binding is unavailable."); sessionId=data.sessionId; break; }
        const body = await native.json() as { code?: string };
        if (native.status !== 409 || body.code !== "turas_binding_pending") break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!sessionId) throw new Error("Chat binding is pending. Reload the chat list to retry.");
      text = await uploadNativeFiles(text, result.data.id, csrfToken);
      stageChatHandoff({conversationId:result.data.id,csrfToken,message:text,requestKey:crypto.randomUUID(),autoSend:!attachments});
      router.push(`/s/${result.data.id}${attachments?"?attachments=1":""}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Chat is unavailable.");
      starting.current = false;
      setState("ready");
    }
  }

  useEffect(()=>{if(pathname==='/s'&&starting.current){starting.current=false;operation.current=null;setState("ready");setDraft("");setDocuments([]);setSelected("");}},[pathname]);
  const creating=state==="creating";
  return <main className={`chat-page ${creating?"chat-thread chat-starting":"chat-landing"}`}>
    {creating&&<div className="chat-messages"><article className="chat-message chat-message-user"><p>{draft}</p></article><p className="chat-thinking" role="status">Thinking</p></div>}
    <div className={creating?"chat-starting-composer":"chat-center"}>
    {!creating&&<h1 className="chat-title">Turi</h1>}
    <div className="landing-input">
      <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void start(); }}>
        <textarea aria-label="Message Turi" placeholder="Message Turi…" value={creating?"":draft}
          maxLength={16_384} disabled={state === "creating"}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void start(); } }} />
        <div className="chat-actions">
          <ComposerLinks text={draft} onChange={setDraft} disabled={state==="creating"||preparingDocuments}/>
          {canAttachDocuments?<OrdinaryDocuments buttonLabel="Attach documents" nativeFilesEnabled={canAttachNativeFiles} documents={documents} onChange={setDocuments} onPreparingChange={setPreparingDocuments} disabled={state==="creating"||preparingDocuments}/>:<button className="composer-attach" type="button" aria-label="Attach documents" disabled={state === "creating"} onClick={() => void start(true)}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 12 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" /></svg>
          </button>}
          <button className="composer-send" type="submit" aria-label="Send message" disabled={(!draft.trim()&&!documents.length)||preparingDocuments||state === "creating"}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
          </button>
        </div>
      </form>
      {!creating&&<div className="chat-context-bar" role="group" aria-label="Conversation context">
        <div className="optional-customer"><CustomerPicker customers={customers} selected={selected}
        onSelect={(value) => { setSelected(value); operation.current = null; }} disabled={state === "loading"} optional /></div>
        {canAttachDocuments&&selected&&<button type="button" className="secondary-button" disabled={preparingDocuments} onClick={()=>void start(true)}>Customer sources</button>}
        <div className="chat-project-space" aria-hidden="true" />
      </div>}
      {state === "unavailable" && <p className="state-message" role="status">Customer selection is unavailable. You can still ask a general question.</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </div></main>;
}
