import { SupportWorkspace } from "../../../../_components/support/workspace";

export default async function SupportPage({ params }: { params: Promise<{ customerId: string }> }) {
  return <SupportWorkspace customerId={(await params).customerId} />;
}
