"use client";
import {useEffect, useState} from 'react';
import Link from 'next/link';
import {retainedChatMessages, type RetainedChatEvent} from '../../lib/conversations/retained-history';
import {ChatMarkdown} from './chat-markdown';
import {NativeChatAttachment} from './attachments/native-chat-attachment';
import {ChatViewport} from './chat-viewport';

export function RetainedChat({conversationId, customerId, initialHistory, initialTruncated = false}: {
  conversationId: string; customerId: string | null; initialHistory: RetainedChatEvent[]; initialTruncated?: boolean;
}) {
  const [history, setHistory] = useState(initialHistory);
  const [truncated, setTruncated] = useState(initialTruncated);
  const [access, setAccess] = useState<'current' | 'changed' | 'unavailable'>('current');
  const [retry, setRetry] = useState(0);
  const [readReady, setReadReady] = useState<string | null>(null);
  const [historyConversation, setHistoryConversation] = useState(conversationId);
  useEffect(() => {
    let active = true, busy = false;
    let controller: AbortController | undefined;
    async function refresh() {
      if (busy) return;
      busy = true; controller = new AbortController();
      try {
        const response = await fetch(`/api/conversations/${conversationId}`, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) throw Error('Read unavailable');
        const {data} = await response.json();
        if (!Array.isArray(data?.history) || data.nativeRetired !== true) throw Error('Read unavailable');
        if (active) {setReadReady(conversationId); setHistoryConversation(conversationId); setHistory(data.history); setTruncated(data.historyTruncated === true); setAccess(data.contextStatus === 'current' ? 'current' : 'changed');}
      } catch {
        if (active) {setReadReady(null); setHistoryConversation(conversationId); setHistory([]); setAccess('unavailable');}
      } finally {busy = false;}
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    const focus = () => void refresh(); window.addEventListener('focus', focus);
    return () => {active = false; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', focus);};
  }, [conversationId, retry]);
  const sameConversation = historyConversation === conversationId;
  const visibleAccess = sameConversation ? access : 'current';
  const visibleTruncated = sameConversation ? truncated : initialTruncated;
  const messages = retainedChatMessages(sameConversation ? history : initialHistory, visibleAccess === 'current');
  return <main className="chat-page chat-thread">
    <p className="chat-notice" role="status">{visibleAccess === 'unavailable'
      ? 'Conversation access could not be confirmed.' : visibleAccess === 'changed'
        ? 'Customer context has changed. Start a new conversation to use current information.'
        : 'This conversation is closed. Your saved messages are available below.'}</p>
    {visibleAccess === 'unavailable' && <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>Retry</button>}
    {visibleTruncated && visibleAccess !== 'unavailable' && <p role="status">This conversation is long. Only the first 500 saved events and recent partial responses are shown.</p>}
    <ChatViewport conversationId={conversationId} ready={readReady === conversationId}>
      {messages.map(message => <article key={message.id} className={`chat-message chat-message-${message.role}`}
        aria-label={message.role === 'assistant' ? 'Turi' : 'You'}>
        {message.parts.map((part, index) => part.type === 'file'
          ? <NativeChatAttachment key={index} filename={part.filename} mediaType={part.mediaType} size={part.size}/>
          : message.role === 'assistant' ? <ChatMarkdown key={index} text={part.text}/> : <p key={index}>{part.text}</p>)}
        {message.partial && <small>Partial response</small>}
      </article>)}
    </ChatViewport>
    <p><Link className="primary-button" href={customerId ? `/s?customerId=${encodeURIComponent(customerId)}` : '/s'}>Start a New Conversation</Link></p>
  </main>;
}
