import { CustomerJourney } from "../../../../_components/profiles/customer-journey";
export default async function Page({ params }: { params: Promise<{ customerId: string }> }) {
  return <CustomerJourney {...await params} />;
}
