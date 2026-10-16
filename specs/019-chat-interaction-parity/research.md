# Research and legacy comparison

Reference: read-only ../turas-back at fd1e205d7fd258676d6fb12b3ade8a431d53a6af; current starting commit8168e74.

| Legacy source/behavior | Current starting behavior | Decision |
| --- | --- | --- |
| components/ai-elements/conversation.tsx: resize following, scroll escape, latest button, per-session restoration | Effect listens only to SDK messages/status; no restoration or latest control | Restore using small current-themed viewport mechanism, including async retained content |
| app/_components/agent-message.tsx: active/inspectable tools and reasoning, inline questions/authorization | Assistant renderer drops every nontext part; questions appended below all messages | Render native activity in message context, retain existing governed decision preview |
| app/_components/agent-chat.tsx: suppress thinking while awaiting user/error | Thinking shown regardless of questions/error | Derive distinct progress states and suppress empty shells |
| components/ai-elements/prompt-input.tsx: form drop and pasted files; Enter/composition | Picker only; Enter/composition already implemented | Reuse existing parser/limits for all three intake paths; preserve keyboard behavior |
| app/_components/composer-attachments.tsx: removable URL/file previews | Removable files, no URL chips/menu | Add prompt-derived URL chips and add-link control in current design |
| app/_components/agent-chat.tsx: steer when draft exists, Stop when empty, clear submitted draft | Existing steering; no synchronous duplicate-send guard, stale completion notices | Keep governance/admission and add client operation guards |
| Legacy cached session events and five-second resume during background work | Current owner/source-rechecked application history plus Eve continuous cursor stream | Keep supported current mechanism; do not add private browser cache or redundant resume polling |
| Legacy header New Chat action | Current shared navigation provides New Chat and clears landing drafts | Keep current navigation and visual layout |
| Legacy multiline field sizing, Enter/Shift+Enter/IME | Already present in current CSS and composer | Preserve and exercise; do not claim a newly restored mechanism |
| Legacy native session URL/ownership save | Current application conversation is created and bound before first send | Preserve durable governed identity and no uncertain redispatch |

No new integration or model selection is needed. Installed Eve frontend docs explicitly support continuous idle/background streaming and remount on conversation change. Installed Next client-component guide confirms effects and browser-only APIs belong in client components.
