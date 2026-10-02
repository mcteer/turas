"use client";
import { EmptyState } from "../empty-state";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import type { WorkforceMapping } from "../../../lib/contracts/staffing-imports";
import { staffingGet, useDirtyStaffingForm, useStaffingCommand, useStaffingDirtyInputs } from "./client";

type Import = { importId: string; sourceId: string; generation: number; sourceVersionId: string | null;
  state: string; uploadState: string; byteSize: number; receivedBytes: number; format: "csv" | "xlsx"; withheld: boolean;
  filename?: string | null; job?: { state: string; errorCode: string | null } | null;
  extraction?: { extractionRunId: string; contentDigest: string; complete: boolean; cellCount: number;
    dateSystem: string; sheets: { index: number; name: string; state: string; rowCount: number; columnCount: number }[];
    coverage: { total: number; visited: number; omitted: { kind: string; count: number; reason: string }[] } } | null };
type Page<T> = { items: T[]; nextCursor: string | null };
type Candidate = { competencyId: string; revisionId: string; contentDigest: string; sourceGeneration: number;
  aggregateVersion: number; resourceId: string; skillId: string; level: number; assessmentDate: string; nextReviewDate: string; evidence: string };
type Row = { rowKey: string; sheetIndex: number; rowNumber: number; columnsComplete: boolean; errors: string[];
  correctedFields: string[]; candidate: Candidate | null; cells: { cellId: string; columnNumber: number; text: string;
    formula: string | null; hiddenSheet: boolean; hiddenRow: boolean; hiddenColumn: boolean; merged: boolean; truncated: boolean }[] };

export function StaffingImports({ csrfToken }: { csrfToken: string }) {
  const fileChoice = useRef(0);
  const [items, setItems] = useState<Import[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null), [digest, setDigest] = useState(""), [intent, setIntent] = useState<Import | null>(null);
  const [message, setMessage] = useState(""), [uploading, setUploading] = useState(false), [uploadUncertain, setUploadUncertain] = useState(false);
  const [dirty, setDirty] = useState(false); useDirtyStaffingForm(dirty || uploadUncertain);
  async function load(next: string | null = null) {
    try { const page = await staffingGet<Page<Import>>(`/api/staffing/imports${next ? `?cursor=${encodeURIComponent(next)}` : ""}`);
      setItems(old => next ? [...old, ...page.items] : page.items); setCursor(page.nextCursor); }
    catch { setMessage("Imports unavailable. Reload to check current status."); }
  }
  useEffect(() => { void load(); }, []);
  const command = useStaffingCommand(csrfToken, async result => {
    if (result.importId) {
      const current = await staffingGet<Import>(`/api/staffing/imports/${result.importId}`); setIntent(current);
      if (current.uploadState === "completed") { setDirty(false); setFile(null); setDigest(""); }
    }
    await load();
  });
  async function choose(next: File | null) {
    const choice = ++fileChoice.current;
    setFile(next); setDigest(""); setMessage(""); setIntent(null); setDirty(!!next);
    if (!next) return;
    if (!/\.(csv|xlsx)$/i.test(next.name) || next.size < 1 || next.size > 10 * 1024 * 1024) {
      setMessage("Choose one CSV or XLSX file of at most 10 MiB."); return;
    }
    const hash = await crypto.subtle.digest("SHA-256", await next.arrayBuffer());
    if (choice !== fileChoice.current) return;
    setDigest(Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, "0")).join(""));
  }
  async function checkUpload() {
    if (!intent) return;
    try { const current = await staffingGet<Import>(`/api/staffing/imports/${intent.importId}`); setIntent(current);
      if (current.uploadState === "uploaded" && current.receivedBytes === current.byteSize) { setUploadUncertain(false); setMessage("Original received. Complete intake to start scanning."); }
      else setMessage("Upload remains unconfirmed. Check again or cancel this intake."); }
    catch { setMessage("Upload status unavailable. Check again before retrying."); }
  }
  async function upload() {
    if (!intent || !file || uploadUncertain) return;
    setUploading(true); setMessage("");
    try {
      const response = await fetch(`/api/staffing/imports/${intent.importId}/content`, { method: "PUT", body: file,
        headers: { "x-csrf-token": csrfToken, "content-type": intent.format === "csv" ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
      if (!response.ok) {
        if (response.status >= 500) throw new Error();
        setMessage("Original was not uploaded. Check the file and intake status before trying again."); return;
      }
      await checkUpload();
    } catch { setUploadUncertain(true); setMessage("Upload is unconfirmed. Check status before retrying."); }
    finally { setUploading(false); }
  }
  return <>
    <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href="/staffing/resources">Resources</Link><span aria-hidden="true">/</span><span>Workforce Imports</span></nav>
    <header className="profile-header"><div><p className="profile-eyebrow">Manager Intake</p><h1>Workforce Imports</h1><p>Scan and review personnel evidence separately from customer knowledge.</p></div></header>
    {(message || command.message) && <p role="status">{message || command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    <section className="profile-section"><form className="evidence-search-form" onSubmit={event => {
      event.preventDefault(); if (file && digest) void command.save("/api/staffing/imports", { filename: file.name,
        format: file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx", byteSize: file.size, contentDigest: digest });
    }}><h2>New Intake</h2><label>Single CSV or XLSX original<input className="field" type="file" accept=".csv,.xlsx" disabled={!!intent || uploading || !!command.uncertainKey}
      onChange={event => void choose(event.target.files?.item(0) ?? null)} /></label>
      <p>Every identity, skill, date and formula correction must be reviewed. A partial extraction cannot be approved.</p>
      {!intent && <button className="primary-button" disabled={!digest || command.busy || !!command.uncertainKey}>Start intake</button>}
    </form>
      {intent && <div className="profile-card"><p>{intent.filename} · {intent.byteSize} bytes · {intent.uploadState}</p>
        {intent.uploadState === "open" && <button className="secondary-button" disabled={uploading || uploadUncertain} onClick={() => void upload()}>Upload original</button>}
        {uploadUncertain && <button className="secondary-button" disabled={uploading} onClick={() => void checkUpload()}>Check upload status</button>}
        {intent.uploadState === "uploaded" && <button className="primary-button" disabled={command.busy || !!command.uncertainKey}
          onClick={() => void command.save(`/api/staffing/imports/${intent.importId}/complete`, { sourceGeneration: intent.generation, contentDigest: digest })}>Complete intake and scan</button>}
        <Link href={`/staffing/imports/${intent.importId}`}>Review Or Cancel Intake</Link>
        {(intent.uploadState === "completed" || intent.withheld) && <button className="secondary-button" disabled={command.busy || !!command.uncertainKey || uploading}
          onClick={() => { ++fileChoice.current; setIntent(null); setFile(null); setDigest(""); setDirty(false); setUploadUncertain(false); }}>Start another intake</button>}
      </div>}
    </section>
    <section className="profile-section"><div className="profile-section-head"><h2>Intake History</h2><button className="secondary-button" onClick={() => void load()}>Reload status</button></div>
      {!items.length && <EmptyState icon="upload" title="No workforce imports available.">Upload a CSV or XLSX file to begin a reviewed intake.</EmptyState>}
      <div className="profile-grid">{items.map(item => <article className="profile-card" key={item.importId}><h3>{item.withheld ? "Retired Workforce Source" : item.filename}</h3>
        <p>{item.state.replaceAll("_", " ")}</p><Link href={`/staffing/imports/${item.importId}`}>Open Intake</Link></article>)}</div>
      {cursor && <button className="secondary-button" onClick={() => void load(cursor)}>More imports</button>}
    </section>
  </>;
}

const fields = ["resource", "skill", "level", "assessmentDate", "nextReviewDate", "evidence"] as const;
const names = { resource: "Resource identity", skill: "Skill identity", level: "Level", assessmentDate: "Assessment date", nextReviewDate: "Next review date", evidence: "Evidence" };
type Table = WorkforceMapping["tables"][number];
export function StaffingImportReview({ importId, csrfToken }: { importId: string; csrfToken: string }) {
  const [source, setSource] = useState<Import | null>(null), [rows, setRows] = useState<Row[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState(""), [rationale, setRationale] = useState("");
  const dirtyInputs = useStaffingDirtyInputs();
  const [retirementRationale, setRetirementRationale] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [tables, setTables] = useState<Table[]>([]);
  const [convention, setConvention] = useState<"ISO" | "DMY" | "MDY">("ISO");
  const [identities, setIdentities] = useState<{ kind: "resources" | "skills"; value: string; id: string }[]>([]);
  const [corrections, setCorrections] = useState<WorkforceMapping["corrections"]>([]);
  async function load() {
    try {
      const current = await staffingGet<Import>(`/api/staffing/imports/${importId}`); setSource(current);
      if (current.withheld) { setRows([]); setCursor(null); return; }
      const page = await staffingGet<Page<Row>>(`/api/staffing/imports/${importId}/rows`); setRows(page.items); setCursor(page.nextCursor); setMessage("");
    } catch { setSource(null); setRows([]); setMessage("Import unavailable. Reload before reviewing."); }
  }
  useEffect(() => { void load(); }, [importId]);
  const command = useStaffingCommand(csrfToken, async () => { await load(); });
  function table(index: number, patch: Partial<Table>) { dirtyInputs.touch("mapping"); setTables(old => old.map((value, i) => i === index ? { ...value, ...patch } : value)); }
  function saveMapping() {
    if (!source?.sourceVersionId || !source.extraction) return;
    void command.save(`/api/staffing/imports/${importId}/mappings`, { sourceVersionId: source.sourceVersionId,
      sourceGeneration: source.generation, extractionRunId: source.extraction.extractionRunId, extractionDigest: source.extraction.contentDigest,
      csvDateConvention: convention, tables, resources: identities.filter(i => i.kind === "resources").map(i => ({ value: i.value, resourceId: i.id })),
      skills: identities.filter(i => i.kind === "skills").map(i => ({ value: i.value, skillId: i.id })), corrections }, "POST", dirtyInputs.confirmation("mapping"));
  }
  function review(action: "accept" | "reject") {
    const candidates = rows.filter(row => selected.includes(row.rowKey)).map(row => row.candidate).filter((row): row is Candidate => !!row);
    void command.save("/api/staffing/competency-decisions", { rows: candidates.map(row => ({ competencyId: row.competencyId,
      candidateRevisionId: row.revisionId, candidateDigest: row.contentDigest, sourceGeneration: row.sourceGeneration,
      expectedAggregateVersion: row.aggregateVersion, action, rationale })) }, "POST", (() => {
      const confirmed = dirtyInputs.confirmation("review");
      return () => { if (confirmed()) { setSelected([]); setRationale(""); } };
    })());
  }
  return <>
    <nav className="profile-breadcrumb" aria-label="Breadcrumb"><Link href="/staffing/imports">Workforce Imports</Link><span aria-hidden="true">/</span><span>Review</span></nav>
    <h1>{source?.withheld ? "Retired Workforce Source" : source?.filename ?? "Workforce Import"}</h1>
    {(message || command.message) && <p role="status">{message || command.message}</p>}
    {command.uncertainKey && <button disabled={command.busy} onClick={() => void command.reconcile()}>Check save receipt</button>}
    <button className="secondary-button" onClick={() => void load()}>Reload status</button>
    {source && <>
      <p>Source state: {source.state.replaceAll("_", " ")}{source.job?.errorCode ? ` · ${source.job.errorCode.replaceAll("_", " ")}` : ""}</p>
      {source.withheld ? <p>Original and personnel evidence are withheld. Audit identities are retained.</p> : <>
        {source.extraction && <section className="profile-section"><h2>Extraction Coverage</h2>
          <p>{source.extraction.complete ? "Complete extraction; explicit mapping and approval required." : "Partial extraction. Replace with a complete original before approval."}</p>
          <p>{source.extraction.cellCount} cells · {source.extraction.coverage.visited} of {source.extraction.coverage.total} visited · {source.extraction.dateSystem} dates</p>
          <ul>{source.extraction.coverage.omitted.map((omission, i) => <li key={i}>{omission.count} {omission.kind}: {omission.reason}</li>)}</ul>
          {source.state === "ready" && <a href={`/api/staffing/imports/${importId}/content`}>Download scanned original</a>}
        </section>}
        {source.extraction?.complete && <section className="profile-section"><form className="evidence-search-form" onSubmit={event => { event.preventDefault(); saveMapping(); }}>
          <h2>Explicit Table Mapping</h2><p>Select each included sheet and its header, row range and six distinct source columns. Hidden cells remain visible and are never automatically approved.</p>
          <label>CSV date convention<select className="field" aria-label="CSV date convention" value={convention} onChange={event => { dirtyInputs.touch("mapping"); setConvention(event.target.value as typeof convention); }}>
            <option value="ISO">YYYY-MM-DD</option><option value="DMY">Day/month/year</option><option value="MDY">Month/day/year</option></select></label>
          {source.extraction.sheets.map(sheet => <label key={sheet.index}><input type="checkbox" checked={tables.some(t => t.sheetIndex === sheet.index)} onChange={event => {
            dirtyInputs.touch("mapping"); setTables(old => event.target.checked ? [...old, { sheetIndex: sheet.index, startRow: 1, endRow: Math.max(2, sheet.rowCount), startColumn: 1,
              endColumn: Math.max(6, sheet.columnCount), headerRow: 1, columns: { resource: 1, skill: 2, level: 3, assessmentDate: 4, nextReviewDate: 5, evidence: 6 } }] : old.filter(t => t.sheetIndex !== sheet.index));
          }} />{sheet.name} · {sheet.state} · {sheet.rowCount} rows</label>)}
          {tables.map((value, index) => <fieldset key={value.sheetIndex}><legend>{source.extraction!.sheets.find(s => s.index === value.sheetIndex)?.name}</legend>
            {(["startRow", "endRow", "startColumn", "endColumn", "headerRow"] as const).map(key => <label key={key}>{({ startRow: "First row", endRow: "Last row", startColumn: "First column", endColumn: "Last column", headerRow: "Header row" })[key]}
              <input className="field" type="number" min={1} required value={value[key]} onChange={event => table(index, { [key]: Number(event.target.value) })} /></label>)}
            {fields.map(field => <label key={field}>{names[field]} column<input className="field" type="number" min={1} required value={value.columns[field]}
              onChange={event => table(index, { columns: { ...value.columns, [field]: Number(event.target.value) } })} /></label>)}
          </fieldset>)}
          <h3>Exact Identity Resolution</h3>
          {identities.map((identity, i) => <fieldset key={i}><legend>Identity {i + 1}</legend>
            <label>Kind<select className="field" aria-label="Kind" value={identity.kind} onChange={event => { dirtyInputs.touch("mapping"); setIdentities(old => old.map((item, n) => n === i ? { ...item, kind: event.target.value as typeof identity.kind } : item)); }}><option value="resources">Resource</option><option value="skills">Skill</option></select></label>
            <label>Exact original value<input className="field" required value={identity.value} maxLength={160} onChange={event => { dirtyInputs.touch("mapping"); setIdentities(old => old.map((item, n) => n === i ? { ...item, value: event.target.value } : item)); }} /></label>
            <label>Canonical identity ID<input className="field" required value={identity.id} onChange={event => { dirtyInputs.touch("mapping"); setIdentities(old => old.map((item, n) => n === i ? { ...item, id: event.target.value } : item)); }} /></label>
            <button type="button" onClick={() => { dirtyInputs.touch("mapping"); setIdentities(old => old.filter((_, n) => n !== i)); }}>Remove identity</button>
          </fieldset>)}
          <button type="button" className="secondary-button" onClick={() => { dirtyInputs.touch("mapping"); setIdentities(old => [...old, { kind: "resources", value: "", id: "" }]); }}>Add exact identity</button>
          <p>Formula-derived identities, levels and dates need a literal correction. Corrections preserve original cell provenance.</p>
          {corrections.map((correction, i) => <fieldset key={i}><legend>Literal Correction {i + 1}</legend>
            <label>Sheet index<input className="field" type="number" min={0} max={19} value={correction.sheetIndex} onChange={event => { dirtyInputs.touch("mapping"); setCorrections(old => old.map((item, n) => n === i ? { ...item, sheetIndex: Number(event.target.value) } : item)); }} /></label>
            <label>Original row<input className="field" type="number" min={2} value={correction.rowNumber} onChange={event => { dirtyInputs.touch("mapping"); setCorrections(old => old.map((item, n) => n === i ? { ...item, rowNumber: Number(event.target.value) } : item)); }} /></label>
            {(["resourceId", "skillId", "level", "assessmentDate", "nextReviewDate", "evidence"] as const).map(key => <label key={key}>{key.replace(/([A-Z])/g, " $1")}
              <input className="field" value={correction[key] ?? ""} type={key === "level" ? "number" : key.endsWith("Date") ? "date" : "text"}
                onChange={event => { dirtyInputs.touch("mapping"); setCorrections(old => old.map((item, n) => { if (n !== i) return item;
                  const changed = { ...item }; if (!event.target.value) delete changed[key];
                  else if (key === "level") changed.level = Number(event.target.value); else changed[key] = event.target.value; return changed; })); }} /></label>)}
            <button type="button" onClick={() => { dirtyInputs.touch("mapping"); setCorrections(old => old.filter((_, n) => n !== i)); }}>Remove correction</button>
          </fieldset>)}
          <button type="button" className="secondary-button" onClick={() => { dirtyInputs.touch("mapping"); setCorrections(old => [...old, { sheetIndex: 0, rowNumber: 2 }]); }}>Add literal correction</button>
          <button className="primary-button" disabled={!tables.length || command.busy || !!command.uncertainKey}>Save exact mapping</button>
        </form></section>}
        <section className="profile-section"><h2>Original Rows And Candidates</h2>
          {!rows.length && <p>No extracted rows available yet.</p>}
          <div className="profile-grid">{rows.map(row => <article className="profile-card" key={row.rowKey}><h3>Sheet {row.sheetIndex} · Row {row.rowNumber}</h3>
            {!row.columnsComplete && <p>Only the first 50 columns are shown. Use the scanned original for full review.</p>}
            <ul>{row.cells.map(cell => <li key={cell.cellId}>Column {cell.columnNumber}: {cell.text}{cell.formula ? " · formula requires literal review" : ""}
              {cell.hiddenSheet || cell.hiddenRow || cell.hiddenColumn ? " · hidden" : ""}{cell.merged ? " · merged" : ""}{cell.truncated ? " · display shortened" : ""}</li>)}</ul>
            {row.errors.length > 0 && <p>Excluded: {row.errors.join(", ").replaceAll("_", " ")}</p>}
            {row.correctedFields.length > 0 && <p>Literal corrections: {row.correctedFields.join(", ")}</p>}
            {row.candidate && <><p>Candidate level {row.candidate.level} · assessed {row.candidate.assessmentDate} · review {row.candidate.nextReviewDate}</p>
              <p>{row.candidate.evidence}</p><label><input type="checkbox" checked={selected.includes(row.rowKey)} onChange={event => {
                dirtyInputs.touch("review"); setSelected(old => event.target.checked ? [...old, row.rowKey] : old.filter(key => key !== row.rowKey));
              }} />Select this exact candidate</label></>}
          </article>)}</div>
          {cursor && <button className="secondary-button" onClick={() => { void staffingGet<Page<Row>>(`/api/staffing/imports/${importId}/rows?cursor=${encodeURIComponent(cursor)}`)
            .then(page => { setRows(old => [...old, ...page.items]); setCursor(page.nextCursor); }).catch(() => setMessage("Rows changed. Reload before review.")); }}>More rows</button>}
          <label>Review rationale<textarea className="field" maxLength={2000} value={rationale} onChange={event => { dirtyInputs.touch("review"); setRationale(event.target.value); }} /></label>
          <div className="evidence-search-controls">{(["accept", "reject"] as const).map(action => <button key={action} className="secondary-button"
            disabled={command.busy || !!command.uncertainKey || !selected.length || selected.length > 100 || !rationale.trim() || !source.extraction?.complete}
            onClick={() => review(action)}>{action === "accept" ? "Accept selected exact candidates" : "Reject selected candidates"}</button>)}</div>
        </section>
        <section className="profile-section"><h2>Retire This Source</h2><label>Cancellation or withdrawal rationale<textarea className="field" value={retirementRationale} maxLength={2000} onChange={event => { dirtyInputs.touch("retirement"); setRetirementRationale(event.target.value); }} /></label>
          <button className="secondary-button" disabled={command.busy || !!command.uncertainKey || !retirementRationale.trim()} onClick={() => {
            void command.save(`/api/staffing/imports/${importId}${source.sourceVersionId ? "" : "/cancel"}`, { sourceGeneration: source.generation, rationale: retirementRationale }, source.sourceVersionId ? "DELETE" : "POST", (() => {
              const confirmed = dirtyInputs.confirmation("retirement");
              return () => { if (confirmed()) setRetirementRationale(""); };
            })());
          }}>{source.sourceVersionId ? "Withdraw source and withhold evidence" : "Cancel intake"}</button>
        </section>
      </>}
    </>}
  </>;
}
