'use client';
import type {ReportDocument} from '../../../lib/reports/document';
export function WeeklyReportContent({document}:{document:ReportDocument}){
 return <div className="report-document">
  {document.sections.map(section=><section key={section.heading} className="profile-section"><div className="profile-section-head"><h2>{section.heading}</h2></div>
   {section.blocks.map((block,index)=><div key={index} className={`report-block report-block-${block.type}`}><p>{block.text}</p>{block.citations.length>0 && <p className="report-citation">Evidence {block.citations.join(', ')}</p>}</div>)}
  </section>)}
   {document.metrics.length>0 && <section className="profile-section"><div className="profile-section-head"><h2>Delivery Measures</h2></div><dl className="report-metrics">{document.metrics.map((metric,index)=><div key={index}><dt>{metric.label}</dt><dd>{metric.value===null?'Unknown':`${metric.value} ${metric.unit}`}{metric.reason && <p className="muted">{metric.reason}</p>}</dd></div>)}</dl></section>}
  <section className="profile-section"><div className="profile-section-head"><h2>Evidence References</h2></div><ul className="report-sources">{document.citations.map(citation=><li key={citation.label}><strong>{citation.label}</strong> {citation.description}</li>)}</ul></section>
  {document.annotations.length>0 && <section className="profile-section"><h2>Reviewer Annotations</h2>{document.annotations.map((annotation,index)=><p key={index}>{annotation}<span className="muted"> · Annotation, not an accepted fact</span></p>)}</section>}
 </div>;
}
