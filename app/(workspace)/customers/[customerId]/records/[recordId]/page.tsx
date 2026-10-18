import { RecordHistoryPage } from "../../../../../_components/profiles/record-history-page";

export default async function Page({ params }: {
  params: Promise<{ customerId: string; recordId: string }>;
}) {
  return <RecordHistoryPage {...await params} />;
}
