import type { PlanDraftContent } from "../../contracts/plan-content";

type Diagram=PlanDraftContent["diagrams"][number];
export type PlanDiagramLayout={width:720;height:number;
  nodes:{key:string;label:string;x:number;y:number}[];
  edges:{key:string;label:string;from:{x:number;y:number};to:{x:number;y:number}}[]};

/** Fixed geometry from validated labels and keys; no source-authored SVG is parsed. */
export function layoutPlanDiagram(diagram:Diagram):PlanDiagramLayout {
  const nodes=diagram.nodes.slice(0,40).map((node,index)=>({
    key:node.key,label:node.label,x:80+(index%4)*180,
    y:65+Math.floor(index/4)*100}));
  const byKey=new Map(nodes.map((node)=>[node.key,node]));
  const edges=diagram.edges.slice(0,80).flatMap((edge)=>{
    const from=byKey.get(edge.from),to=byKey.get(edge.to);
    return from && to ? [{key:edge.key,label:edge.label,from:{x:from.x,y:from.y},
      to:{x:to.x,y:to.y}}]:[];
  });
  return {width:720,height:Math.max(160,110+Math.ceil(nodes.length/4)*100),
    nodes,edges};
}
