import Link from "next/link";
export function StaffingUnavailable({ message }: { message: string }) {
  return <main className="profile-page"><section className="profile-state"><h1>Staffing unavailable</h1>
    <p role="status">{message}</p><Link href="/customers">Return to customers</Link>
  </section></main>;
}
