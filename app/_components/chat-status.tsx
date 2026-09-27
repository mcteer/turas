export function ChatStatus({ notice, responseState, error }: {
  notice?: string; responseState?: string; error?: boolean;
}) {
  const label = responseState === "stopping" ? "Stopping requested. Waiting for confirmation…"
    : responseState === "cancelled" ? "Response cancelled. Partial output may be visible."
      : responseState === "failed" ? "Response failed. Partial output may be visible."
        : responseState === "completed" ? "Response complete."
          : notice ?? "";
  if (!label && !error) return null;
  return <p className={error ? "status-alert" : "state-message"} role={error ? "alert" : "status"}>
    {error ? "Chat is unavailable. Retry the status check or reload." : label}</p>;
}
