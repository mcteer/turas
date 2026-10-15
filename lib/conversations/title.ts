/** Legacy first-message title, with whitespace collapsed and an 80-character bound. */
export function titleFromMessage(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 80) || "New conversation";
}
