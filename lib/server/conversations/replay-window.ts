import type {IndexedNativeEvent} from './reconcile';
/** v27 cursors count complete source lines, not the facts inside them. */
export function completeReplayWindow(events:readonly IndexedNativeEvent[],start:number){
 let next=start,lastLine=-1,lastFact=-2,complete=true;
 for(const item of events){
  if(!Number.isSafeInteger(item.index))return false;
  if(item.event.meta.protocol!==27){if(item.index!==next)return false;next++;continue;}
  const coordinate=item.event.meta.position;
  if(!coordinate||coordinate.line!==item.index||!Number.isSafeInteger(coordinate.index))return false;
  if(item.index===lastLine){if(coordinate.index<=lastFact)return false;}
  else {if(!complete||item.index!==next)return false;lastLine=item.index;lastFact=-2;}
  lastFact=coordinate.index;complete=item.event.meta.endOfLine!==false;
  next=Math.max(next,item.event.meta.next??item.index+1);
 }
 return !events.length||events.at(-1)!.event.meta.endOfLine!==false;
}
export function nextNativeIndex(item:IndexedNativeEvent){return item.event.meta.protocol===27&&item.event.meta.endOfLine===false?item.index:item.event.meta.next??item.index+1;}
