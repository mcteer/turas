# Runtime Peer Upgrade Assessment — 2026-11-16

## Decision and Baseline

Implement PR [#56](https://github.com/mcteer/turas/pull/56) as inspected at
`8bdac34d9f814f72cf43cf0ca2118e3c64773b49`: AI7.0.158→7.0.172 and
Connect2.6.0→2.9.2. Main baseline `cffceeb2`; Eve0.91.0 and the selected root
model remain unchanged. Both spans cross the three-release policy threshold.
Alternative: blindly apply the bot diff; rejected because it omits capability assessment.
Alternative: upgrade Eve1.x too; excluded because it is not in the notification and
would introduce separately governed session/API/default-tool migration.

## AI SDK Release Review

Primary sources: exact npm tarball `ai@7.0.172` CHANGELOG.md, bundled
`docs/03-ai-sdk-core/60-telemetry.mdx`, source `src/telemetry/`, and
[upstream changelog](https://github.com/vercel/ai/blob/ai%407.0.172/packages/ai/CHANGELOG.md).
Reviewed every version after7.0.158 through7.0.172:

| Releases | Capabilities/change | Turas disposition |
| --- | --- | --- |
|159|Gateway dependency update|Accept compatible provider fixes; no new workflow.|
|160|Steering queue, streamed custom data validation, smooth-stream error|Keep Eve's owned delivery/approval protocol; SDK useChat/steering is not this UI. Accept fixes transitively.|
|161|Cross-realm binary inputs/message cloning|Accept for file compatibility; retain existing serialized-file tests.|
|162|Approval continuation metadata, WorkflowAgent durable telemetry bridge|Accept metadata fix; defer WorkflowAgent bridge because Eve owns execution and no new exporter is authorized.|
|163|Effective content filtering for integrations/diagnostic subscribers; sanitized endpoint metadata|SELECT: shared content-free telemetry policy on direct decision/search/public research calls, tested against installed SDK. Preserve caller results/accounting.|
|163|Google ordering/signatures, legacy URL parts, union schema outputs|Accept provider fixes; no provider/model switch or deprecated URL API adoption.|
|163|Native URL transcription, timing metadata, realtime transport/types, uploaded video outcomes|Defer: Turas has no active audio/realtime/video workflow.|
|163|Typed optional heartbeat stream parts|Accept compatible pass-through; do not count ping as settlement/completion. Test against existing specialist accounting wrapper.|
|164–166|Gateway/provider utility updates; URL/transcription telemetry redaction|Accept privacy/provider fixes; do not infer backend identity where optional metadata is absent.|
|167|Provider credential redaction and telemetry separation|Accept defense in depth; selected policy additionally withholds whole input/output payloads. No new provider-specific tools.|
|168|Chat queue, invalid-tool onError callback fix|Defer SDK chat queue: existing Eve continuation/cancellation authority remains. Accept callback fix.|
|169|Zod Mini internals, queued approval options|Accept compatible internal validation; preserve public schemas and Turas domain validation.|
|170|Incremental array streaming; queued-send cancellation|Accept fixes; existing stop/unknown-hold boundaries retain authority. No new array output workflow.|
|171|Bounded malformed-message validation|Accept defense in depth; retain own input limits.|
|171|Fetch transport for downloads and abort propagation|Defer new downloader wiring: existing research fetch has DNS/redirect/size/authority controls; direct calls use text, private file paths stay on existing governed Eve adapter. No untrusted URL auto-fetch feature added.|
|171–172|Experimental extraction and explicit remote-download hooks for extract/decide|Defer experimental extraction: isolated scan/parser and evidence approval pipeline already governs ingestion. Existing decision workflow uses bounded text generateText, not experimental_decide.|
|171|Tool-error disclosure defaults and reasoning replay warning|No AI SDK UI-message streaming/conversion in app; Eve native events and Turas projection govern disclosure. Preserve existing private/error projection tests. Never treat raw tool errors as approval.|

No speculative feature installation; accepted fixes do not themselves replace domain
policy. Newer7.0.173 appeared upstream during investigation but is outside the bot's
reviewed immutable target and is not silently substituted.

## Connect Release Review

Decision: accept the requested compatible2.9.2 peer, defer optional new integrations.
Rationale: no active application Connect imports, channels, AWS or Resend connector
workflow. The public repository changelog currently stops at2.5.6, so exact published
npm README/dist comparisons establish shipped changes without inventing missing notes.
Primary sources: [npm2.9.2](https://www.npmjs.com/package/@vercel/connect/v/2.9.2),
registry tarballs for each2.7.0–2.9.2 release, baseline2.6.0 and their bundled README.

- 2.7.0: Telegram Eve credential helper. Deferred: no authorized Telegram channel.
- 2.8.0: AWS credentials/lazy refresh provider. Deferred: no authorized AWS workflow.
- 2.9.0: Resend Eve credentials/Chat adapter. Deferred: current reporting uses existing
  authorized Resend path; adding a connector is not required for this notification.
- 2.9.1/.2: dist and README unchanged; OIDC dependencies advance to4.0.8/.9.
  Published OIDC4.0.5→4.0.9 runtime diff changes embedded version only; changelog
  identifies cli-config dependency updates. No new authorization behavior claimed.
- Inherited cli-config0.3.5→0.4.0: Zod4.1.11→^4.6.6; XDG_CACHE_HOME
  honored before homedir; optional login welcome/introduction/MFA reminder fields;
  xdg-app-paths pinned5.1.0 with compatibility lookup for prior Windows config paths.
  Exact published artifacts for every intermediate version were compared because
  notes are omitted. No required fields/exported functions change. Mac/Linux paths
  remain equivalent; Windows CLI fallback is the compatibility-sensitive change.
  Accept inherited maintenance; it does not change Turas application accounts.
- Shared existing runtime implementation unchanged aside from exports/comments;
  Eve peer range expands to include1.0 prereleases while preserving0.91 compatibility.

## Privacy Contract and Tradeoffs

Direct research generation currently has no explicit input/output recording policy.
A diagnostic subscriber can exist without an exporter registration. Set both recording
flags false through one immutable policy; structural events and usage remain available.
Do not attach customer identifiers/runtime context. Do not enable exporters or log payloads.
The new SDK filters before subscriber/integration delivery, including raw span results
and generic span errors, while preserving application callbacks/returned results.
This is a privacy boundary for diagnostics, not authorization or retained history policy.
Embedding calls already opt out; Eve instrumentation has its separate governed policy.

## Verification and Release

Synthetic installed-SDK tests exercise generate/stream, error privacy, raw metadata,
usage preservation and ping accounting. Reuse existing domain budget/stop/error tests,
full unit checks, typecheck and both builds. No Next code change or schema migration.
Complete CI/authenticated Preview profiles/WebKit and review precede merge; exact
Production source/schema and changed behavior follow. Record unavailable checks honestly.
