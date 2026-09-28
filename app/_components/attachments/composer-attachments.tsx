"use client";

import { useEffect, useState } from "react";
import { SourceViewer, type DraftSourceSelection } from "./source-viewer";

type Intent = { id: string; state: string; versionId: string | null; receivedBytes: number;
  expectedSizeBytes: number; safeErrorCode: string | null };
type Item = { file: File; intent: Intent | null; versionState: string | null;
  attached?: boolean; error: string | null };
const declaredTypes: Record<string, string> = {
  pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv", txt: "text/plain", md: "text/markdown",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
};
const sizeLabel = (bytes: number) => bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`;

export function ComposerAttachments({ conversationId, customerId, customerName, csrfToken,
  onDraftSelectionsChange, resetSelectionVersion }: {
  conversationId: string; customerId: string; customerName: string; csrfToken: string;
  onDraftSelectionsChange?: (selections: DraftSourceSelection[]) => void;
  resetSelectionVersion?: number;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [rightsNote, setRightsNote] = useState("");
  const [audience, setAudience] = useState<"internal" | "delivery">("delivery");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [draftSelections, setDraftSelections] = useState<DraftSourceSelection[]>([]);
  const [priorSources, setPriorSources] = useState<Array<{ versionId: string;
    displayName: string; state: string }>>([]);
  const [attachedPrevious, setAttachedPrevious] = useState<string[]>([]);
  useEffect(() => { setDraftSelections([]); }, [resetSelectionVersion]);
  useEffect(() => {
    let active = true;
    void fetch(`/api/artifacts?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" })
      .then(async (response) => {
        if (response.ok && active) setPriorSources((await response.json() as {
          data: { items: typeof priorSources } }).data.items);
      }).catch(() => undefined);
    return () => { active = false; };
  }, [customerId]);

  function selectDraft(selection: DraftSourceSelection | null) {
    const next = draftSelections.filter((item) => item.versionId !== viewing);
    if (selection) next.push(selection);
    setDraftSelections(next);
    onDraftSelectionsChange?.(next);
  }

  useEffect(() => {
    const active = items.filter((item) => item.intent && !["cancelled","expired","failed"].includes(item.intent.state));
    if (!active.length) return;
    const poll = async () => {
      for (const item of active) {
        try {
          const intentResponse = await fetch(`/api/artifacts/intents/${item.intent!.id}`, { cache: "no-store" });
          if (!intentResponse.ok) continue;
          const intent = (await intentResponse.json() as { data: Intent }).data;
          let versionState = item.versionState;
          if (intent.versionId) {
            const versionResponse = await fetch(`/api/artifacts/${intent.versionId}`, { cache: "no-store" });
            if (versionResponse.ok) versionState = (await versionResponse.json() as { data: { state: string } }).data.state;
          }
          let attached = item.attached;
          if (intent.versionId && ["ready","partial"].includes(versionState ?? "") && !attached) {
            const attach = await fetch(`/api/conversations/${conversationId}/attachments`, {
              method: "POST", headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
              body: JSON.stringify({ versionId: intent.versionId,idempotencyKey: intent.id }) });
            attached = attach.ok;
          }
          setItems((current) => current.map((entry) => entry.intent?.id === intent.id
            ? { ...entry, intent, versionState, attached } : entry));
        } catch { /* next poll rechecks durable status */ }
      }
    };
    const timer = setInterval(() => { void poll(); }, 2_000);
    return () => clearInterval(timer);
  }, [items]);

  async function upload() {
    const selected = items.filter((item) => !item.intent && !item.error);
    if (!selected.length || !rightsNote.trim() || busy) return;
    setBusy(true);
    setNotice("Creating private upload intents…");
    try {
      const response = await fetch("/api/artifacts/intents", { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ conversationId, customerId, idempotencyKey: crypto.randomUUID(),
          files: selected.map(({ file }) => ({ name: file.name, expectedSizeBytes: file.size,
            declaredType: declaredTypes[file.name.split(".").at(-1)?.toLowerCase() ?? ""] ?? file.type,
            sourcePublishedOn: null, sourceObservedOn: null, rightsNote: rightsNote.trim(),
            audience, dataCategory: audience === "delivery" ? "delivery_context" : "internal_operations" })) }),
      });
      if (!response.ok) throw new Error((await response.json() as { error: { message: string } }).error.message);
      const batch = (await response.json() as { data: { intents: Intent[] } }).data;
      for (const [index, selectedItem] of selected.entries()) {
        const intent = batch.intents[index];
        setItems((current) => current.map((item) => item.file === selectedItem.file ? { ...item, intent } : item));
        const bytes = await fetch(`/api/artifacts/intents/${intent.id}/bytes`, { method: "PUT",
          headers: { "content-type": "application/octet-stream", "x-csrf-token": csrfToken }, body: selectedItem.file });
        if (!bytes.ok) throw new Error((await bytes.json() as { error: { message: string } }).error.message);
        const complete = await fetch(`/api/artifacts/intents/${intent.id}/complete`, { method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
          body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
        if (!complete.ok) throw new Error((await complete.json() as { error: { message: string } }).error.message);
        const completed = (await complete.json() as { data: Intent }).data;
        setItems((current) => current.map((item) => item.file === selectedItem.file
          ? { ...item, intent: completed, versionState: "quarantined" } : item));
      }
      setNotice("Files received. Scanning and extraction continue privately.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Upload unavailable"); }
    finally { setBusy(false); }
  }

  async function cancel(item: Item) {
    if (!item.intent) { setItems((current) => current.filter((entry) => entry !== item)); return; }
    if (item.intent.versionId) return;
    try {
      const response = await fetch(`/api/artifacts/intents/${item.intent.id}/cancel`, { method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error();
      setItems((current) => current.filter((entry) => entry.file !== item.file));
    } catch { setNotice("Cancel status is uncertain. Check upload status before retrying."); }
  }

  async function reattach(versionId: string) {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/attachments`, {
        method: "POST",headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ versionId,idempotencyKey: crypto.randomUUID() }) });
      if (!response.ok) throw new Error();
      setAttachedPrevious((current) => [...current,versionId]);
      setNotice("Source attached to this private conversation. Select exact units before sending.");
    } catch { setNotice("Source could not be attached. Check its current access and state."); }
  }

  return <section className="composer-attachments" aria-label="Customer documents">
    <p className="muted">Documents for {customerName} stay private until you submit selected evidence for review.</p>
    <label className="field-label" htmlFor="artifact-files">Attach documents</label>
    <input id="artifact-files" type="file" multiple accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg"
      disabled={busy} onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        if (files.length > 5 || files.reduce((sum, file) => sum + file.size, 0) > 26_214_400 ||
            files.some((file) => file.size < 1 || file.size > 10_485_760)) {
          setNotice("Select up to five files, each at most 10 MiB, totaling at most 25 MiB."); return;
        }
        setItems((current) => [...current, ...files.map((file) => ({ file, intent: null,
          versionState: null, error: null }))].slice(0, 5));
        event.target.value = "";
      }} />
    {items.length > 0 && <>
      <label className="field-label" htmlFor="artifact-rights">Source rights note</label>
      <input className="field" id="artifact-rights" maxLength={500} value={rightsNote}
        onChange={(event) => setRightsNote(event.target.value)} placeholder="How may this source be used?" />
      <label className="field-label" htmlFor="artifact-audience">Audience</label>
      <select className="field" id="artifact-audience" value={audience}
        onChange={(event) => setAudience(event.target.value as "internal" | "delivery")}>
        <option value="delivery">Delivery</option><option value="internal">Internal</option>
      </select>
      <ul className="attachment-list">{items.map((item) => <li key={item.intent?.id ?? item.file.name}>
        <span>{item.file.name} · {sizeLabel(item.file.size)} · {item.versionState ?? item.intent?.state ?? "selected"}</span>
        {item.intent?.safeErrorCode && <span role="alert">{item.intent.safeErrorCode}</span>}
        {item.intent?.versionId && item.attached && ["ready","partial"].includes(item.versionState ?? "") &&
          <button type="button" className="secondary-button" onClick={() => setViewing(item.intent!.versionId)}>Inspect source</button>}
        {!item.intent?.versionId && <button type="button" className="secondary-button"
          onClick={() => void cancel(item)}>Remove</button>}
      </li>)}</ul>
      <button type="button" className="secondary-button" disabled={busy || !rightsNote.trim() || !items.some((item) => !item.intent)}
        onClick={() => void upload()}>Upload selected documents</button>
    </>}
    {priorSources.filter((source) => !items.some((item) => item.intent?.versionId === source.versionId))
      .length > 0 && <div><h3>Previously uploaded sources</h3><ul className="attachment-list">
      {priorSources.filter((source) => !items.some((item) => item.intent?.versionId === source.versionId))
        .map((source) => <li key={source.versionId}><span>{source.displayName} · {source.state}</span>
          {attachedPrevious.includes(source.versionId) ? <button type="button" className="secondary-button"
            onClick={() => setViewing(source.versionId)}>Inspect source</button> :
            <button type="button" className="secondary-button" onClick={() => void reattach(source.versionId)}>
              Attach to this chat</button>}</li>)}</ul></div>}
    {notice && <p role="status" className="state-message">{notice}</p>}
    {draftSelections.length > 0 && <p role="status">{draftSelections.length} source
      selection{draftSelections.length === 1 ? "" : "s"} ready for this chat.</p>}
    {viewing && <SourceViewer versionId={viewing} onClose={() => setViewing(null)}
      onDraftSelection={selectDraft} />}
  </section>;
}
