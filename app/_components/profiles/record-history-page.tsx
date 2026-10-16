"use client";
import { useRouter } from "next/navigation";
import { RecordHistory } from "./record-history";

export function RecordHistoryPage({ customerId, recordId }: { customerId: string; recordId: string }) {
  const router = useRouter();
  return <main className="profile-page"><RecordHistory customerId={customerId} recordId={recordId}
    scope="Customer record" onClose={() => router.push(`/customers/${customerId}`)} /></main>;
}
