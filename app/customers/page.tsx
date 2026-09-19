import Link from "next/link";
import { z } from "zod";
import { ProtectedShell } from "@/app/_components/protected-shell";
import { maturitySignals, maturitySignalSchema, PUBLIC_CUSTOMER_EVIDENCE, searchPublicAccounts } from "@/lib/customer-evidence/repository";

const filtersSchema = z.object({ query: z.string().trim().max(160).optional(), signal: maturitySignalSchema.or(z.literal("")).optional() });

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const filters = filtersSchema.safeParse(await searchParams);
  const query = filters.success ? filters.data.query ?? "" : "";
  const signal = filters.success ? filters.data.signal ?? "" : "";
  const accounts = searchPublicAccounts(query, signal);
  const snapshot = PUBLIC_CUSTOMER_EVIDENCE;
  return <ProtectedShell returnTo="/customers"><main className="mx-auto max-w-6xl p-6 pt-16 md:pt-8">
    <p className="text-sm text-muted-foreground">Public evidence · reviewed {snapshot.reviewedAt}</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">Customer evidence</h1>
    <p className="mt-3 max-w-3xl text-muted-foreground">What Vercel has published about its customers and their workloads. Documented capabilities inform discovery; formal maturity and current internal engagement state remain unknown.</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <Metric label="Organizations in this inventory" value={snapshot.accounts.length} />
      <Metric label="Published customer stories" value={snapshot.coverage.storyCount} />
      <Metric label="Directory-only entries" value={snapshot.accounts.filter((account) => !account.evidence.length).length} />
    </div>
    <details className="mt-5 rounded-lg border p-4 text-sm">
      <summary className="cursor-pointer font-medium">Coverage and interpretation</summary>
      <p className="mt-3 text-muted-foreground">{snapshot.coverage.definition} One story is an unnamed retailer. The publisher’s own logo is excluded.</p>
      <p className="mt-2 text-muted-foreground">Signals are editorial groupings of published capabilities, not official maturity ratings. A story about one website, prototype or partner project does not establish company-wide adoption. Publication dates establish when a claim was published, not whether it remains true today. Logo-only entries establish no maturity signal.</p>
      <p className="mt-2 text-muted-foreground">These public records are separate from the <Link className="underline" href="/portfolio">fictional financial scenarios</Link>. No customer fees, staffing, internal risks or decisions have been inferred.</p>
      <p className="mt-2"><a className="underline" href={snapshot.directoryUrl} target="_blank" rel="noreferrer">Official directory</a> · <a className="underline" href={snapshot.archiveUrls[0]} target="_blank" rel="noreferrer">Customer story archive</a></p>
    </details>
    <form className="mt-7 flex flex-wrap items-end gap-3" action="/customers">
      <label className="min-w-0 flex-1 text-sm font-medium">Search customers, workloads or products<input className="mt-2 block h-10 w-full rounded-md border bg-background px-3 font-normal" defaultValue={query} maxLength={160} name="query" placeholder="e.g. Notion, Sandbox, ecommerce" type="search" /></label>
      <label className="text-sm font-medium">Documented signal<select className="mt-2 block h-10 max-w-full rounded-md border bg-background px-3 font-normal" defaultValue={signal} name="signal"><option value="">All signals</option>{maturitySignals.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground" type="submit">Search</button>
    </form>
    {!filters.success && <p role="alert" className="mt-3 text-sm text-destructive">Invalid search filters. Showing the full inventory; enter a shorter query or choose a listed signal.</p>}
    <p className="mt-5 text-sm text-muted-foreground" role="status">{accounts.length} matching organization{accounts.length === 1 ? "" : "s"}</p>
    {accounts.length ? <div className="mt-3 grid gap-4 lg:grid-cols-2">{accounts.map((account) => <Link className="rounded-xl border bg-card p-5 transition hover:border-foreground/40 focus-visible:outline-2 focus-visible:outline-offset-2" href={`/customers/${account.id}`} key={account.id}>
      <h2 className="text-lg font-semibold">{account.name}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{account.evidence.length ? [...new Set(account.evidence.map((item) => item.signal))].join(" · ") : "Directory listing only · no documented maturity signals"}</p>
      <p className="mt-3 text-xs text-muted-foreground">{account.evidence.length ? `${account.evidence.length} published source(s) · latest ${account.evidence[0].publishedAt}` : `Directory reviewed ${snapshot.reviewedAt}`} · Formal maturity unknown</p>
    </Link>)}</div> : <div className="mt-3 rounded-xl border p-6"><h2 className="font-semibold">No matching public evidence</h2><p className="mt-2 text-sm text-muted-foreground">This inventory is not a complete customer registry. A missing result does not mean the organization is not a Vercel customer.</p><Link className="mt-3 inline-block text-sm underline" href="/customers">Clear filters</Link></div>}
  </main></ProtectedShell>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></div>;
}
