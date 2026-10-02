import type { StaffingCommandResult } from "../server/staffing/commands";
export type StaffingCommandSnapshot = Readonly<{ busy: boolean; message: string; uncertainKey: string | null }>;
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;
type Envelope = { data?: StaffingCommandResult; error?: { message?: string } };

/** Browser-memory-only admission and reconciliation. A lost response keeps its
 * request identity until the read-only receipt confirms it. Never retry writes. */
export class StaffingCommandClient {
  snapshot: StaffingCommandSnapshot = { busy: false, message: "", uncertainKey: null };
  private confirmed: (() => void) | undefined;
  private listeners = new Set<() => void>();
  constructor(private csrfToken: string, private fetcher: Fetcher,
    private completed: (result: StaffingCommandResult) => void | Promise<void>) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private change(patch: Partial<StaffingCommandSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch }; for (const listener of this.listeners) listener();
  }
  async save(url: string, body: object, method = "POST", confirmed?: () => void): Promise<boolean> {
    if (this.snapshot.busy || this.snapshot.uncertainKey) return false;
    this.confirmed = confirmed;
    const requestKey = crypto.randomUUID(), controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    this.change({ busy: true, message: "" });
    try {
      const serialized = JSON.stringify({ ...body, requestKey });
      const response = await this.fetcher(url, { method, signal: controller.signal,
        headers: { "content-type": "application/json", "x-csrf-token": this.csrfToken }, body: serialized });
      const envelope = await response.json() as Envelope;
      if (!response.ok) {
        if (response.status >= 500) this.change({ uncertainKey: requestKey,
          message: "Save is unconfirmed. Check its receipt before making another change." });
        else this.change({ message: envelope.error?.message ?? "Change was not saved. Review and try again." });
        return false;
      }
      if (!envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new Error("Missing command receipt");
      this.change({ message: "Saved." });
      try { this.confirmed?.(); this.confirmed = undefined; await this.completed(envelope.data); }
      catch { this.change({ message: "Saved. Reload to view the current result." }); }
      return true;
    } catch {
      this.change({ uncertainKey: requestKey, message: "Save is unconfirmed. Check its receipt before making another change." });
      return false;
    } finally { clearTimeout(timeout); this.change({ busy: false }); }
  }
  async reconcile(): Promise<boolean> {
    if (this.snapshot.busy || !this.snapshot.uncertainKey) return false;
    const key = this.snapshot.uncertainKey, controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    this.change({ busy: true });
    try {
      const response = await this.fetcher(`/api/staffing/commands/${key}`, { cache: "no-store", signal: controller.signal });
      const envelope = await response.json() as Envelope;
      if (!response.ok || !envelope.data || typeof envelope.data !== "object" || Array.isArray(envelope.data)) throw new Error("Unconfirmed receipt");
      this.change({ uncertainKey: null, message: "Save confirmed." });
      try { this.confirmed?.(); this.confirmed = undefined; await this.completed(envelope.data); }
      catch { this.change({ message: "Save confirmed. Reload to view the result." }); }
      return true;
    } catch { this.change({ message: "Save is unconfirmed. Check again before making another change." }); return false; }
    finally { clearTimeout(timeout); this.change({ busy: false }); }
  }
}
