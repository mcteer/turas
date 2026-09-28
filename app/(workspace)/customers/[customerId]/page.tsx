import { ProfileOverview } from "../../../_components/profiles/profile-overview";

export default async function CustomerProfilePage({ params }: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <ProfileOverview customerId={customerId} />;
}
