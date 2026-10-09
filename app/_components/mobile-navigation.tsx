"use client";

import { useEffect, useRef, useState } from "react";

export function MobileNavigation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLElement>("button, a, input")?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = [...dialog.current.querySelectorAll<HTMLElement>("button:not(:disabled),a[href],input:not(:disabled),[tabindex='0']")];
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); trigger.current?.focus(); };
  }, [open]);
  return <>
    <button className="mobile-trigger" ref={trigger} type="button" aria-label="Open navigation"
      aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
    {open && <div className="mobile-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setOpen(false);
    }}><div className="mobile-panel" ref={dialog} role="dialog" aria-modal="true" aria-label="Navigation"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a[href]")) setOpen(false);
      }}>
      <div className="sidebar"><button className="mobile-close" type="button" aria-label="Close navigation"
        onClick={() => setOpen(false)}>✕</button>{children}</div>
    </div></div>}
  </>;
}
