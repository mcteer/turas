import Link from "next/link";
import { notFound } from "next/navigation";
import { ProtectedShell } from "@/app/_components/protected-shell";
import { getPublicAccount, PUBLIC_CUSTOMER_EVIDENCE } from "@/lib/customer-evidence/repository";

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = getPublicAccount(id);
  if (!account) notFound();
  return <ProtectedShell returnTo={`/customers/${id}`}><main className="mx-auto max-w-4xl p-6 pt-16 md:pt-8">
    <Link className="text-sm underline" href="/customers">← Customer evidence</Link>
    <p className="mt-6 text-sm text-muted-foreground">Public sources · reviewed {PUBLIC_CUSTOMER_EVIDENCE.reviewedAt}</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">{account.name}</h1>
    <div className="mt-5 rounded-xl border bg-muted/40 p-5 text-sm leading-6"><p><strong>Formal maturity: unknown.</strong> The cited material supports workload-specific capability signals, not a current company-wide maturity grade.</p><p className="mt-2"><strong>Internal engagement: unavailable.</strong> No verified handoff, owner, commercial terms, staffing, open risks or decisions are loaded for this account.</p><p className="mt-2 text-muted-foreground">Historical public claims are not live telemetry. Signals below are editorial groupings, not Vercel’s official assessment or independent verification of reported outcomes.</p></div>
    {account.directoryListed && <p className="mt-5 text-sm">Listed in <a className="underline" href={PUBLIC_CUSTOMER_EVIDENCE.directoryUrl} target="_blank" rel="noreferrer">Vercel’s customer directory</a> at review time. A logo does not establish product usage or maturity.</p>}
    <h2 className="mt-8 text-xl font-semibold">Documented capabilities</h2>
    {account.evidence.length ? <div className="mt-4 space-y-5">{account.evidence.map((item) => <article className="rounded-xl border bg-card p-5" key={item.url}>
      <p className="text-xs font-medium text-muted-foreground">{item.signal} · Published {item.publishedAt}</p>
      <h3 className="mt-2 text-lg font-semibold">{item.scope}</h3>
      <p className="mt-3 text-sm leading-6">{item.summary}</p>
      <p className="mt-3 text-sm text-muted-foreground">Products described in this source: {item.products.join(", ") || "Not specified"}.</p>
      {item.cautions.map((caution) => <p className="mt-3 border-l-2 border-amber-600 pl-3 text-sm leading-6" key={caution}>{caution}</p>)}
      <a className="mt-4 inline-block text-sm underline underline-offset-4" href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a>
    </article>)}</div> : <p className="mt-4 rounded-xl border p-5 text-sm text-muted-foreground">No customer story was found in the reviewed archive for this directory entry. Maturity signals and workload scope are unknown.</p>}
    <Link className="mt-7 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href={`/s?customer=${encodeURIComponent(account.id)}`}>Discuss this evidence with Turi</Link>
  </main></ProtectedShell>;
}
