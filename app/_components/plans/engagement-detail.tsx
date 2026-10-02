"use client";

import Link from "next/link";
import { useEffect,useRef,useState } from "react";
type Engagement={engagementId:string;planId:string;acceptedRevisionId:string;
  baselineNumber:number;title:string;contentAvailability:string;reviewRequired:boolean;
  milestones:{key:string;title:string;track:string;exitEvidence:string;
    customerValidation:string;plannedDate:string|null;plannedDateUnknownReason?:string}[]|null;
  workPackages:{key:string;title:string;track:string;exitEvidence:string}[]|null;
  acceptedAt:string;staffingAssignments?:{items:{assignmentId:string;displayName:string|null;deliveryRole:string|null;
    days:{date:string;minutes:number}[];reviewRequired:boolean}[];nextCursor:string|null}|null};
type Envelope={data?:Engagement;error?:{message:string}};

export function EngagementDetailView({customerId,engagementId}:{
  customerId:string;engagementId:string}) {
  const [detail,setDetail]=useState<Engagement|null>(null);
  const [message,setMessage]=useState("");
  const [staffingAllowed,setStaffingAllowed]=useState(false);
  const [loadingAssignments,setLoadingAssignments]=useState(false);
  const sequence=useRef(0),assignmentCursor=useRef<string|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    ++sequence.current;assignmentCursor.current=null;setLoadingAssignments(false);
    setDetail(null);setMessage("");
    setStaffingAllowed(false);
    void fetch(`/api/staffing/engagements/${engagementId}?customerId=${customerId}`, {cache:"no-store",signal:controller.signal})
      .then(response=>setStaffingAllowed(response.ok)).catch(()=>setStaffingAllowed(false));
    const read=()=>{const ticket=++sequence.current;
      return fetch(`/api/engagements/${engagementId}${assignmentCursor.current ? `?assignmentCursor=${encodeURIComponent(assignmentCursor.current)}`:""}`,{cache:"no-store",signal:controller.signal})
      .then(async(response)=>{
        const body=await response.json() as Envelope;
        if (sequence.current!==ticket) return;
        if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Engagement unavailable");
        setDetail(body.data);
        setMessage("");
      }).catch((error:unknown)=>{
        if (sequence.current!==ticket) return;
        if (error instanceof DOMException && error.name==="AbortError") return;
        setDetail(null);setStaffingAllowed(false);
        setMessage(error instanceof Error ? error.message:"Engagement unavailable");
      });};
    void read();
    const timer=window.setInterval(()=>{void read();},10_000);
    return ()=>{++sequence.current;controller.abort();window.clearInterval(timer);};
  },[customerId,engagementId]);
  return <main className="profile-page"><nav aria-label="Breadcrumb" className="profile-breadcrumb">
    <Link href="/customers">Customers</Link><span aria-hidden="true">/</span>
    <Link href={`/customers/${customerId}`}>Profile</Link><span aria-hidden="true">/</span>
    <span>Engagement</span></nav>
    {message && <p role="alert">{message}</p>}
    {!detail && !message && <p role="status">Loading engagement…</p>}
    {detail && <><header className="profile-header"><div>
      <p className="profile-eyebrow">Accepted Internal Baseline {detail.baselineNumber}</p>
      <h1>{["readable", "historical_warning"].includes(detail.contentAvailability) ? detail.title : "Review Required"}</h1><p className="muted">Accepted {new Date(detail.acceptedAt).toLocaleString()}</p>
      </div><Link href={`/customers/${customerId}/plans/${detail.planId}`}>Source Plan</Link>
      </header>
      {staffingAllowed && <Link className="secondary-button" href={`/customers/${customerId}/engagements/${engagementId}/staffing`}>Staffing Demand</Link>}
      {detail.contentAvailability==="historical_warning" && <p role="status" className="profile-caution">
        Evidence dates need review before current use.</p>}
      {!["readable","historical_warning"].includes(detail.contentAvailability) ? <section className="profile-state" role="status">
        <h2>Review Required</h2><p>Source material changed. Baseline text is unavailable.</p>
      </section> : <><section className="profile-section"><h2>Planned Work</h2>
        {detail.workPackages?.map((item)=><article className="profile-card" key={item.key}>
          <h3>{item.title}</h3><p>{item.track}</p><p>Exit evidence: {item.exitEvidence}</p>
        </article>)}</section><section className="profile-section"><h2>Planned Milestones</h2>
        {detail.milestones?.map((item)=><article className="profile-card" key={item.key}>
          <h3>{item.title}</h3><p>{item.track} · {item.plannedDate ?? item.plannedDateUnknownReason}</p>
          <p>Exit evidence: {item.exitEvidence}</p>
          <p>Customer validation: {item.customerValidation}</p>
        </article>)}</section></>}
      <p className="muted">This is an internal delivery baseline. Customer approval and staffing are separate decisions.</p>
      {detail.staffingAssignments && <section className="profile-section"><h2>Confirmed Future Assignments</h2>
        {!detail.staffingAssignments.items.length && <p>No confirmed future assignments available.</p>}
        {detail.staffingAssignments.items.map(assignment=><article className="profile-card" key={assignment.assignmentId}>
          <h3>{assignment.displayName ?? "Assignment Narrative Unavailable"}</h3>
          {assignment.deliveryRole && <p>{assignment.deliveryRole}</p>}
          {assignment.reviewRequired && <p role="status">Current assignment inputs need review.</p>}
          {assignment.days.map(day=><p key={day.date}>{day.date} · {day.minutes} confirmed minutes</p>)}
          <p className="evidence-citation">Assignment {assignment.assignmentId}</p>
        </article>)}
        {detail.staffingAssignments.nextCursor && <button className="secondary-button" disabled={loadingAssignments} onClick={()=>{
          setLoadingAssignments(true);
          assignmentCursor.current=detail.staffingAssignments!.nextCursor!;
          const ticket=++sequence.current;
          void fetch(`/api/engagements/${engagementId}?assignmentCursor=${encodeURIComponent(detail.staffingAssignments!.nextCursor!)}`,{cache:"no-store"})
            .then(async response=>{const body=await response.json() as Envelope;if(sequence.current!==ticket)return;if(!response.ok || !body.data)throw new Error("Assignments unavailable");
              // Replace with the currently authorized page; retain no stale names
              // or earlier pages across a source/permission refresh.
              setDetail(body.data);setMessage("");})
            .catch(()=>{if(sequence.current===ticket){setDetail(null);setMessage("Assignments unavailable. Reload current engagement access.");}})
            .finally(()=>setLoadingAssignments(false));
        }}>Next confirmed assignments</button>}
      </section>}
    </>}
  </main>;
}
