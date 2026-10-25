"use client";

import { useEffect, useRef, useState } from "react";

export function MobileNavigation({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => { setInteractive(true); }, []);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = dialog.current;
    if (!open || !panel) return;
    const focusable = () => [...panel.querySelectorAll<HTMLElement>(
      "button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]",
    )].filter(element => element.tabIndex >= 0 && !element.closest("[hidden],[inert]") && element.getClientRects().length > 0);
    focusable()[0]?.focus();
    // Isolate sibling branches, never an ancestor containing the dialog.
    const background: { element: HTMLElement; inert: boolean; hidden: string | null }[] = [];
    for (let branch: HTMLElement = panel; branch !== document.body && branch.parentElement; branch = branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue;
        background.push({ element: sibling, inert: sibling.inert, hidden: sibling.getAttribute("aria-hidden") });
        sibling.inert = true;
        sibling.setAttribute("aria-hidden", "true");
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.contains(event.target)) focusable()[0]?.focus();
    };
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab") return;
      const elements = focusable(), first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", containFocus);
      for (const { element, inert, hidden } of background) {
        element.inert = inert;
        if (hidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", hidden);
      }
      trigger.current?.focus();
    };
  }, [open]);
  return <>
    <button className="mobile-trigger" ref={trigger} type="button" aria-label="Open navigation"
      disabled={!interactive} aria-expanded={open} onClick={() => setOpen(true)}>☰</button>
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
