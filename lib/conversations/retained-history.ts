/** Application-owned visible projections; these are not reconstructed native events. */
export type RetainedChatEvent = {
  eventId: string; eventType: string; payload: Record<string, unknown>;
  turnId?: string | null; stepIndex?: number | null; inputAliasEventIds?: string[];
};
export type RetainedChatPart = {type: 'text'; text: string} |
  {type: 'file'; filename?: string; mediaType: string; size?: number};
export type RetainedChatMessage = {
  id: string; deliveryId?:string; role: 'user' | 'assistant'; parts: RetainedChatPart[]; partial: boolean;
  turnId?: string | null; stepIndex?: number | null; inputAliasEventIds?: string[];
};

export function retainedChatMessages(events: readonly RetainedChatEvent[], includeGenerated = true): RetainedChatMessage[] {
  const seen = new Set<string>(), messages: RetainedChatMessage[] = [];
  for (const event of events) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    const user = event.eventType === 'message.received';
    const partial = event.eventType === 'message.appended' && event.payload.partial === true;
    if (!user && (!includeGenerated || event.eventType !== 'message.completed' && !partial)) continue;
    const parts: RetainedChatPart[] = [];
    const displayParts = Array.isArray(event.payload.applicationInputParts) ? event.payload.applicationInputParts : event.payload.parts;
    if (user && Array.isArray(displayParts)) for (const value of displayParts) {
      if (!value || typeof value !== 'object') continue;
      if (value.type === 'text' && typeof value.text === 'string') parts.push({type: 'text', text: value.text});
      if (value.type === 'file' && typeof value.mediaType === 'string') parts.push({type: 'file', mediaType: value.mediaType,
        ...(typeof value.filename === 'string' ? {filename: value.filename} : {}),
        ...(Number.isSafeInteger(value.size) && value.size >= 0 ? {size: value.size} : {})});
    }
    const text = partial ? event.payload.messageDelta : event.payload.message;
    if (!parts.length && typeof text === 'string' && text.length) parts.push({type: 'text', text});
    if (parts.length) messages.push({id: event.eventId, ...(user&&event.payload.nativeProtocol===27&&typeof event.payload.deliveryId==='string'?{deliveryId:event.payload.deliveryId}:{}), role: user ? 'user' : 'assistant', parts, partial,...(event.turnId!==undefined?{turnId:event.turnId}:{}),...(event.stepIndex!==undefined?{stepIndex:event.stepIndex}:{}),...(event.inputAliasEventIds?{inputAliasEventIds:event.inputAliasEventIds}:{})});
  }
  return messages;
}
