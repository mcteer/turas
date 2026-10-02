"use client";
import { useEffect, useState, useRef, useSyncExternalStore } from "react";
import { StaffingCommandClient } from "../../../lib/staffing/client-commands";
import type { StaffingCommandResult } from "../../../lib/server/staffing/commands";

export async function staffingGet<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const envelope = await response.json() as { data?: T; error?: { message: string } };
  if (!response.ok || !envelope.data) throw new Error(envelope.error?.message ?? "Staffing unavailable");
  return envelope.data;
}
export function useStaffingCommand(csrfToken: string, onSuccess: (result: StaffingCommandResult) => Promise<void>) {
  const completed = useRef(onSuccess); completed.current = onSuccess;
  const [controller] = useState(() => new StaffingCommandClient(csrfToken,
    (url, options) => fetch(url, options), result => completed.current(result)));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...snapshot, save: controller.save.bind(controller), reconcile: controller.reconcile.bind(controller) };
}

export function useDirtyStaffingForm(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const navigation = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest("a[href]");
      if (link && !window.confirm("Leave this page and discard unsaved staffing changes?")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", unload); document.addEventListener("click", navigation, true);
    return () => { window.removeEventListener("beforeunload", unload); document.removeEventListener("click", navigation, true); };
  }, [dirty]);
}

/** Dirty generations contain no field values. A confirmed receipt may clear only
 * the submitted generation; edits made while a save was uncertain are retained. */
export function useStaffingDirtyInputs() {
  const generations = useRef(new Map<string, number>()), sequence = useRef(0);
  const [dirty, setDirty] = useState(false);
  function touch(key: string) { generations.current.set(key, ++sequence.current); setDirty(true); }
  function confirmation(key: string, form?: HTMLFormElement) {
    const generation = generations.current.get(key);
    return () => {
      if (generations.current.get(key) !== generation) return false;
      generations.current.delete(key); form?.reset(); setDirty(generations.current.size > 0); return true;
    };
  }
  useDirtyStaffingForm(dirty);
  return { dirty, touch, confirmation };
}
