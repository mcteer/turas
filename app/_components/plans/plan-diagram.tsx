"use client";

import type { PlanDraftContent } from "../../../lib/contracts/plan-content";
import { layoutPlanDiagram } from "../../../lib/server/plans/diagrams";

type Diagram=PlanDraftContent["diagrams"][number];
export function PlanDiagram({diagram}:{diagram:Diagram}) {
  const layout=layoutPlanDiagram(diagram);
  const nodes=layout.nodes;
  const edges=layout.edges;
  return <figure className="plan-diagram" tabIndex={0}>
    <figcaption>{diagram.kind} diagram</figcaption>
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img"
      aria-label={diagram.textEquivalent}>
      {edges.map((edge)=>{
        const from=edge.from,to=edge.to;
        return <g key={edge.key}><line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
          stroke="currentColor" strokeWidth="1.5"/><text x={(from.x+to.x)/2}
          y={(from.y+to.y)/2-5} textAnchor="middle" fill="currentColor"
          fontSize="11">{edge.label}</text></g>;
      })}
      {nodes.map((node)=>{
        const point=node;
        return <g key={node.key}><rect x={point.x-68} y={point.y-23} width="136"
          height="46" rx="8" fill="var(--background)" stroke="currentColor"/>
          <text x={point.x} y={point.y+4} textAnchor="middle" fill="currentColor"
            fontSize="12">{node.label}</text></g>;
      })}
    </svg>
    <p>{diagram.textEquivalent}</p>
    <table><caption>Accessible flow</caption><thead><tr><th>From</th><th>Connection</th>
      <th>To</th></tr></thead><tbody>{diagram.edges.map((edge)=><tr key={edge.key}>
        <td>{nodes.find((node)=>node.key===edge.from)?.label ?? edge.from}</td>
        <td>{edge.label}</td>
        <td>{nodes.find((node)=>node.key===edge.to)?.label ?? edge.to}</td>
      </tr>)}</tbody></table>
  </figure>;
}
