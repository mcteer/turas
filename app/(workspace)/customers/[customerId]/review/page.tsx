import { ReviewQueue } from "../../../../_components/profiles/review-queue";

export default async function CustomerReviewPage({ params }: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  return <ReviewQueue customerId={customerId} />;
}
