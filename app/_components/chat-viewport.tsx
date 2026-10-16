"use client";

import {useLayoutEffect, useRef, useState, type ReactNode} from "react";

type Position = {scrollTop: number; atBottom: boolean};
const nearBottom = 80;

function readPosition(key: string): Position | undefined {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || !("scrollTop" in value) ||
        !("atBottom" in value) || typeof value.scrollTop !== "number" ||
        !Number.isFinite(value.scrollTop) || value.scrollTop < 0 ||
        value.scrollTop > Number.MAX_SAFE_INTEGER || typeof value.atBottom !== "boolean") return;
    return {scrollTop: value.scrollTop, atBottom: value.atBottom};
  } catch { return; }
}

/** Keeps coordinates only; authorized message content remains outside storage. */
export function ChatViewport({conversationId, ready, children}: {
  conversationId: string; ready: boolean; children: ReactNode;
}) {
  const paneRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  const updateRef = useRef<() => void>(() => {});
  const jumpRef = useRef<() => void>(() => {});
  const [showLatest, setShowLatest] = useState(false);

  useLayoutEffect(() => {
    const pane = paneRef.current, content = contentRef.current;
    if (!pane || !content) return;
    const key = `turas:chat-scroll:${conversationId}`;
    let restoring = readPosition(key);
    let following = restoring?.atBottom ?? true;
    let lastValidPosition = restoring;
    let wasReady = readyRef.current;
    let userScrollIntent = false;
    let frame: number | undefined;
    let programmaticTop: number | undefined;
    const maximum = () => Math.max(0, pane.scrollHeight - pane.clientHeight);
    const distance = () => maximum() - pane.scrollTop;
    const save = () => {
      // An empty initial render must not replace a delayed history's position.
      if (restoring || !readyRef.current) return;
      lastValidPosition = {scrollTop: Math.max(0, pane.scrollTop), atBottom: following};
      try {
        sessionStorage.setItem(key, JSON.stringify(lastValidPosition));
      } catch { /* Unavailable storage does not prevent reading or scrolling. */ }
    };
    const move = (top: number) => {
      pane.scrollTop = top;
      programmaticTop = pane.scrollTop;
    };
    const update = () => {
      if (!readyRef.current) {
        wasReady = false;
        setShowLatest(false);
        return;
      }
      if (!wasReady) restoring = lastValidPosition ?? restoring;
      wasReady = true;
      if (restoring) {
        if (restoring.atBottom) {
          restoring = undefined;
          following = true;
          move(maximum());
        } else {
          following = false;
          const target = restoring.scrollTop;
          move(Math.min(target, maximum()));
          // Images and deferred history can still make room for this offset.
          if (maximum() + 1 >= target) restoring = undefined;
        }
      } else if (following) {
        move(maximum());
      }
      setShowLatest(!following && distance() > nearBottom);
      save();
    };
    const schedule = () => {
      if (frame !== undefined) return;
      frame = requestAnimationFrame(() => {frame = undefined; update();});
    };
    const escapeRestore = (intent = true) => {
      userScrollIntent = intent;
      restoring = undefined;
      programmaticTop = undefined;
    };
    const scroll = () => {
      if (!readyRef.current) {
        if (userScrollIntent) {
          following = distance() <= nearBottom;
          lastValidPosition = {scrollTop: Math.max(0, pane.scrollTop), atBottom: following};
          userScrollIntent = false;
        }
        return;
      }
      if (programmaticTop !== undefined && Math.abs(pane.scrollTop - programmaticTop) < 1) {
        programmaticTop = undefined;
        userScrollIntent = false;
        return;
      }
      escapeRestore(false);
      following = distance() <= nearBottom;
      setShowLatest(!following);
      save();
    };
    const wheel = (event: WheelEvent) => {
      escapeRestore();
      if (event.deltaY < 0) following = false;
    };
    const touch = () => {escapeRestore();};
    const keydown = (event: KeyboardEvent) => {
      if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      escapeRestore();
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || (event.key === " " && event.shiftKey)) following = false;
    };
    const pointer = (event: PointerEvent) => {
      if (event.target === pane) {escapeRestore(); following = false;}
    };
    const jump = () => {
      if (!readyRef.current) return;
      escapeRestore();
      following = true;
      move(maximum());
      setShowLatest(false);
      save();
    };
    // Commit readiness transitions before a fast failed-read/retry can share a frame.
    updateRef.current = update;
    jumpRef.current = jump;
    pane.addEventListener("scroll", scroll, {passive: true});
    pane.addEventListener("wheel", wheel, {passive: true});
    pane.addEventListener("touchstart", touch, {passive: true});
    pane.addEventListener("keydown", keydown);
    pane.addEventListener("pointerdown", pointer);
    window.addEventListener("pagehide", save);
    const resize = new ResizeObserver(schedule);
    resize.observe(content);
    resize.observe(pane);
    const mutation = new MutationObserver(schedule);
    mutation.observe(content, {childList: true, subtree: true, characterData: true});
    update();
    return () => {
      save();
      if (frame !== undefined) cancelAnimationFrame(frame);
      resize.disconnect();
      mutation.disconnect();
      pane.removeEventListener("scroll", scroll);
      pane.removeEventListener("wheel", wheel);
      pane.removeEventListener("touchstart", touch);
      pane.removeEventListener("keydown", keydown);
      pane.removeEventListener("pointerdown", pointer);
      window.removeEventListener("pagehide", save);
      updateRef.current = () => {};
      jumpRef.current = () => {};
    };
  }, [conversationId]);

  useLayoutEffect(() => {updateRef.current();}, [ready, children]);

  return <div className="chat-viewport">
    <div className="chat-messages" ref={paneRef} tabIndex={0} role="region"
      aria-label="Conversation messages" aria-live="polite" style={{overflowAnchor: "none"}}>
      <div className="chat-messages-content" ref={contentRef} style={{overflowAnchor: "none"}}>{children}</div>
    </div>
    {showLatest && ready && <button type="button" className="secondary-button chat-scroll-bottom"
      onClick={() => {jumpRef.current();paneRef.current?.focus({preventScroll:true});}}>Scroll to bottom</button>}
  </div>;
}
