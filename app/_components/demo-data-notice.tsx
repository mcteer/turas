export function DemoDataNotice({ synthetic }: { synthetic: boolean }) {
  if (!synthetic) return <p className="chat-notice">Customer context is limited to approved records and public research.</p>;
  return <p className="chat-notice"><strong>Demo context.</strong> Synthetic customer data and public research only.
    Chat claims are not accepted profile facts.</p>;
}
