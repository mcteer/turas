"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RecordForm } from "./record-form";
import { OwnSubmissions } from "./own-submissions";
import { MaturityAssessment } from "./maturity-assessment";
import { EvidenceDetail } from "./evidence-detail";
import { RecordHistory } from "./record-history";
import { ConflictReview,TypedConflictReview } from "./conflict-review";
import { EvidenceSearch } from "./evidence-search";

type ApprovedExcerpt = { sourceLabel: string; excerpt: string; attestation: string;
  citation: Record<string, string | number> };
type Fact = { id: string; recordId: string; workloadId: string | null; kind: string;
  recordVersion: number; reviewState: string; payload: Record<string, unknown>; quality?: { band?: string; Q?: number };
  qualityInput?: Record<string, unknown>; audience?: "internal" | "delivery"; dataCategory?: string;
  supportStatus?: string; sourceStatus?: string; sourceAttestation?: string;
  approvedArtifactExcerpt?: ApprovedExcerpt };
type Profile = { customer: { id: string; displayName: string; synthetic: boolean };
  workloads: { id: string; displayName: string; lifecycle: string }[];
  canReview: boolean;
  publicResearchCoverage?: { asOf: string; description?: string; coverage: { area: string; state: string; explanation: string }[]; unknowns: string[] } | null;
  openConflicts?: { id: string; state: "flagged" | "confirmed"; version: number;
    firstRevisionId: string; secondRevisionId: string; rationale: string }[];
  acceptedFacts: Fact[]; attributedResearch: { sourceRevisionId: string; title: string;
    supportedClaim: string; quality: { band: string; Q: number } }[] };
type Envelope = { data?: Profile; error?: { message: string } };

const titles: Record<string, string> = {
  customer_details: "Customer Details", workload_details: "Workloads", stakeholder: "Stakeholders",
  product_use: "Product Use", maturity_assessment: "Maturity", risk: "Risks",
  engagement_reference: "Engagements", decision: "Decisions", outcome: "Outcomes",
  next_review: "Next Reviews", claim: "Other Context",
};
const order = Object.keys(titles);
const researchAreaTitles: Record<string, string> = { identity: "Company Identity", vercel_relationship: "Vercel Relationship", architecture_outcomes: "Architecture and Outcomes", releases: "Product Releases", employee_testimony: "Employee Testimony", practitioner_experience: "Practitioner Experience" };
const researchStateTitles: Record<string, string> = { supported: "Supported", not_found: "No Finding Retained", unavailable: "Unavailable", incomplete: "Incomplete" };

function factTitle(fact: Fact): string {
  const p = fact.payload;
  for (const key of ["displayName", "name", "title", "subject", "productKey", "category", "statement", "text"])
    if (typeof p[key] === "string") return String(p[key]);
  return titles[fact.kind] ?? "Profile Fact";
}

function FactCard({ fact, scope, onHistory }: { fact: Fact; scope: string; onHistory: () => void }) {
  const detail = Object.entries(fact.payload).filter(([key, value]) =>
    key !== "kind" && !["displayName", "name", "title", "subject", "productKey"].includes(key) &&
    value !== null && value !== undefined &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean" ||
      (Array.isArray(value) && value.every((item) => typeof item === "string"))));
  const display = (value: unknown) => Array.isArray(value) ?
    value.length ? value.join(", ") : "None recorded" : String(value);
  return <article className="profile-card">
    <div className="profile-card-head"><h3>{factTitle(fact)}</h3>
      <span className="profile-badge">{fact.quality?.band ?? "Unknown"}</span></div>
    <p><span className="profile-label">Scope: </span>{scope}</p>
    {detail.map(([key, value]) => <p key={key}><span className="profile-label">{key.replace(/([A-Z])/g, " $1").replaceAll("_", " ").toLowerCase()}: </span>{display(value)}</p>)}
    {fact.supportStatus && fact.supportStatus !== "settled" &&
      <p className="profile-caution">Support: {fact.supportStatus.replaceAll("_", " ")}</p>}
    {fact.sourceAttestation && <p className="profile-note">{fact.sourceAttestation}</p>}
    {fact.approvedArtifactExcerpt && <div className="profile-note" aria-label="Reviewed source excerpt">
      <p>{fact.approvedArtifactExcerpt.sourceLabel}: {fact.approvedArtifactExcerpt.excerpt}</p>
      <p className="muted">{Object.entries(fact.approvedArtifactExcerpt.citation).map(([key, value]) =>
        `${key} ${value}`).join(" · ")} · {fact.approvedArtifactExcerpt.attestation}</p>
    </div>}
    <button type="button" className="secondary-button" onClick={onHistory}>View history</button>
  </article>;
}

export function ProfileOverview({ customerId }: { customerId: string }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [workloadId, setWorkloadId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "unavailable">("loading");
  const [retry, setRetry] = useState(0);
  const [internal,setInternal]=useState(false);
  useEffect(()=>{const controller=new AbortController();void fetch("/api/auth/session",{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json() as {data?:{membership:{kind:string}}};setInternal(response.ok&&body.data?.membership.kind==="internal");}).catch(()=>setInternal(false));return()=>controller.abort();},[customerId]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  useEffect(() => {
    const refresh = () => setRetry((value) => value + 1);
    window.addEventListener("focus", refresh);
    const interval = window.setInterval(refresh, 5_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(interval); };
  }, []);
  const scopeLabel = (workloadId: string | null) => workloadId ?
    profile?.workloads.find((item) => item.id === workloadId)?.displayName ?? "Workload-specific" :
    "Customer-wide";
  useEffect(() => {
    const controller = new AbortController();
    setStatus((current) => current === "ready" ? current : "loading");
    const url = new URL(`/api/customers/${encodeURIComponent(customerId)}/profile`, window.location.origin);
    if (workloadId) url.searchParams.set("workloadId", workloadId);
    void fetch(url, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        setProfile(null); setStatus("denied"); return;
      }
      const envelope = await response.json() as Envelope;
      if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Unavailable");
      setProfile(envelope.data); setStatus("ready");
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setProfile(null); setStatus("unavailable");
    });
    return () => controller.abort();
  }, [customerId, workloadId, retry]);

  return <main className="profile-page">
    <nav aria-label="Breadcrumb" className="profile-breadcrumb"><Link href="/customers">Customers</Link><span aria-hidden="true">/</span><span>Profile</span></nav>
    {status === "loading" && <p role="status" className="profile-state">Loading customer profile…</p>}
    {status === "denied" && <div role="alert" className="profile-state"><h1>Profile Unavailable</h1><p>This customer is unavailable to your account.</p><Link href="/customers">Back to Customers</Link></div>}
    {status === "unavailable" && <div role="alert" className="profile-state"><h1>Could Not Load This Profile</h1><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>Retry</button></div>}
    {status === "ready" && profile && <>
      <header className="profile-header"><div><p className="profile-eyebrow">Customer Profile</p><h1>{profile.customer.displayName}</h1>
        <p className="muted">Accepted customer context and attributed research</p></div>
        <div className="profile-header-actions">{profile.customer.synthetic && <span className="profile-badge">Synthetic demo</span>}
          {profile.canReview && <Link className="secondary-button" href={`/customers/${customerId}/review`}>Review Proposals</Link>}</div>
      </header>
      <div className="profile-toolbar"><label htmlFor="profile-workload">Workload</label>
        <select id="profile-workload" className="field" value={workloadId} onChange={(event) => setWorkloadId(event.target.value)}>
          <option value="">All workloads</option>
          {profile.workloads.map((workload) => <option key={workload.id} value={workload.id}>{workload.displayName}</option>)}
        </select><Link className="secondary-button" href={`/s?customerId=${encodeURIComponent(customerId)}`}>Start Chat</Link>
        <Link className="secondary-button" href={`/customers/${customerId}/plans`}>Delivery Plans</Link>
        <Link className="secondary-button" href={`/customers/${customerId}/support`}>Support Guidance</Link>{internal&&<><Link className="secondary-button" href={`/customers/${customerId}/expansion`}>Expansion Opportunities</Link><Link className="secondary-button" href={`/customers/${customerId}/product-gaps`}>Product Gaps</Link></>}</div>
      <EvidenceSearch customerId={customerId} workloadId={workloadId || undefined} />
      <TypedConflictReview customerId={customerId} canReview={profile.canReview} />
      {profile.acceptedFacts.length === 0 && <div className="profile-state"><h2>No Accepted Facts Yet</h2><p>Submitted context appears here after review. An empty section is not a negative assessment.</p></div>}
      {order.map((kind) => {
        const facts = profile.acceptedFacts.filter((fact) => fact.kind === kind);
        if (!facts.length) return null;
        return <section key={kind} className="profile-section" aria-labelledby={`profile-${kind}`}>
          <div className="profile-section-head"><h2 id={`profile-${kind}`}>{titles[kind]}</h2><span>{facts.length}</span></div>
          <div className="profile-grid">{facts.map((fact) => fact.kind === "maturity_assessment" ?
            <div key={fact.id}><MaturityAssessment payload={fact.payload as Parameters<typeof MaturityAssessment>[0]["payload"]}
              scope={scopeLabel(fact.workloadId)}
              supportStatus={fact.supportStatus} /><button type="button" className="secondary-button"
              onClick={() => setSelectedRecordId(fact.recordId)}>View history</button></div> :
            <FactCard key={fact.id} fact={fact}
              scope={scopeLabel(fact.workloadId)}
              onHistory={() => setSelectedRecordId(fact.recordId)} />)}</div>
        </section>;
      })}
      {selectedRecordId && <RecordHistory key={selectedRecordId} customerId={customerId} recordId={selectedRecordId}
        scope={scopeLabel(profile.acceptedFacts.find((fact) => fact.recordId === selectedRecordId)?.workloadId ?? null)}
        onClose={() => setSelectedRecordId(null)} />}
      <section className="profile-section" aria-labelledby="profile-research"><div className="profile-section-head"><h2 id="profile-research">Attributed Research</h2><span>{profile.attributedResearch.length}</span></div>
        {profile.publicResearchCoverage && <details className="profile-card"><summary>Public Research Coverage</summary>
          <p className="muted">Checked {new Date(profile.publicResearchCoverage.asOf).toLocaleDateString()}. Public evidence does not establish private engagement or formal maturity.</p>
          {profile.publicResearchCoverage.description && <><h3>Attributed Public Overview</h3><p>{profile.publicResearchCoverage.description}</p></>}
          <ul>{profile.publicResearchCoverage.coverage.map(area => <li key={area.area}><strong>{researchAreaTitles[area.area] ?? "Public Research"}</strong>: {researchStateTitles[area.state] ?? "Incomplete"} — {area.explanation}</li>)}</ul>
          {profile.publicResearchCoverage.unknowns.length > 0 && <><h3>Unknowns</h3><ul>{profile.publicResearchCoverage.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        </details>}
        {profile.attributedResearch.length === 0 ? <p className="muted">No attributed research is available.</p> :
          <div className="profile-grid">{profile.attributedResearch.map((item) => <article key={item.sourceRevisionId} className="profile-card"><h3>{item.title}</h3><p>{item.supportedClaim}</p><span className="profile-badge">{item.quality.band}</span><button type="button" className="secondary-button" onClick={() => setSelectedSourceId(item.sourceRevisionId)}>View source</button></article>)}</div>}
      </section>
      {selectedSourceId && <EvidenceDetail customerId={customerId} sourceRevisionId={selectedSourceId}
        canReview={profile.canReview}
        onChanged={() => setRetry((value) => value + 1)}
        onClose={() => setSelectedSourceId(null)} />}
      {profile.openConflicts && <ConflictReview customerId={customerId}
        facts={profile.acceptedFacts} conflicts={profile.openConflicts} canReview={profile.canReview}
        onChanged={() => setRetry((value) => value + 1)} />}
      <RecordForm customerId={customerId} workloads={profile.workloads}
        acceptedFacts={profile.acceptedFacts} onSaved={() => setRetry((value) => value + 1)} />
      <OwnSubmissions customerId={customerId} refresh={retry} />
    </>}
  </main>;
}
