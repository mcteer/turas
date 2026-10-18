"use client";

// Only invalidation crosses components. The list always rereads its authorized
// server projection; no titles, messages or account data enter this event.
export const conversationUpdatedEvent='turas:conversations-updated';
export function notifyConversationsUpdated(){window.dispatchEvent(new Event(conversationUpdatedEvent));}
