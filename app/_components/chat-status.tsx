export function ChatStatus({ notice, responseState, error, quietSuccess = false, errorMessage }: {
  notice?: string; responseState?: string; error?: boolean; quietSuccess?: boolean; errorMessage?: string;
}) {
  const label = notice || (responseState === 'waiting_input' ? 'Waiting for your reply.' : responseState === "stopping" ? "Stopping requested. Waiting for confirmation…"
    : responseState === "cancelled" ? "Response cancelled. Partial output may be visible."
      : responseState === "failed" ? errorMessage ?? "Response failed. Partial output may be visible."
        : responseState === "completed" ? quietSuccess ? "" : "Response complete."
          : "");
  if (!label && !error) return null;
  return <p className={error ? "status-alert" : "state-message"} role={error ? "alert" : "status"}>
    {error ? errorMessage ?? (notice || "Connection interrupted. Reload to reconnect; your message will not be sent again.") : label}</p>;
}
