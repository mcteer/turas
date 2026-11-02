# Dependency and resource assessment

Assessed 2026-11-02 against main `98cbb63c`: 31 open GitHub alerts, including two critical and nine high. Alert presence is maintenance evidence, not a claim that every advisory is exploitable in Turas. No advisory is dismissed by this work.

## Original PR dispositions

| PR | Assessment and selected work |
| --- | --- |
| [53](https://github.com/mcteer/turas/pull/53) | Renderer Zod4.6.6 fixes high GHSA-mrhx-c7xc-m3w5; deliver newer4.6.7 with59 before retirement. |
| [54](https://github.com/mcteer/turas/pull/54) | Adopt setup-node7.1.0 version validation/manifest retries, preserving version source/cache scope. |
| [55](https://github.com/mcteer/turas/pull/55) | Major download-artifact4→8 requires this spec; adopt8.0.2 with explicit digest errors and directory/completeness verification. |
| [56](https://github.com/mcteer/turas/pull/56) | Adopt AI7.0.158/Connect2.6.0 with interrupted-provider accounting regression; preserve Eve/model. |
| [57](https://github.com/mcteer/turas/pull/57) | Adopt test/accessibility/SDK/style fixes, including Vitest security patches; pair environment loader16.4.3 with application Next16.4.3. Loader alone does not fix Next. |
| [58](https://github.com/mcteer/turas/pull/58) | Adopt root Zod4.6.7 for high validation alert and same-major nested copies where compatible. |
| [59](https://github.com/mcteer/turas/pull/59) | Deliver renderer4.6.7; supersede53/59 only after delivered replacement. |

## Intervening capability review

### Zod4.5.4→4.6.7

Reviewed [intervening releases](https://github.com/colinhacks/zod/releases), including4.6.0/4.6.5/4.6.6/4.6.7. Select new `.validate()` for the transform-free `mcpBearerSchema` predicate: malformed credentials reject before database work without constructing error/result objects. Persisted scope/expiry/revocation/authorization still apply. Test malformed, oversized and valid-syntax-but-missing credentials. Retain parse/safeParse when decoded output or errors are needed.

Defer compilation (unnecessary runtime code generation), property/instance validation (contracts intentionally produce DTOs), new JSON-Schema collection keywords/custom parsers (no arbitrary schema intake here), and IBAN (no banking workflow). CommonJS, recursive memory, metadata/error-map fixes apply through the dependency; run existing enum/email/base64/emoji/schema-provider tests. Do not change product requirements solely to exercise APIs.

### AI7.0.137→7.0.158

Reviewed each intervening version in the [changelog](https://github.com/vercel/ai/blob/main/packages/ai/CHANGELOG.md). Select new interrupted-finish semantics: the current guard settles all non-error finishes, so explicitly withhold completion/settlement on interrupted generation and stream. Test real wrapped fixture providers and a completed positive control. Unknown holds and original expiry remain.

Adopt duplicate approval, toolChoice-none, orphaned reasoning, partial JSON and structured-output fixes via current governed tests. Removal of SDK runtime type checks never removes Turas validation. Stable active-tool/stream-part exports need no change where unused. Defer speech, decision APIs, experimental steering/low-memory streams, sandbox file APIs and extra telemetry hooks: Eve owns runtime controls; new workflows need separate cost/privacy contracts. No second runtime or speculative integration.

### Connect2.5.2→2.6.0

Reviewed [changelog](https://github.com/vercel/vercel/blob/main/packages/connect/CHANGELOG.md):2.5.3–2.5.6 advance OIDC and tighten project/environment-bound forwarded webhook verification. Preserve these protections. Upstream main currently lacks a2.6.0 section: inspect the published package changelog before acceptance and record any remaining provenance gap. Defer managed subscriptions/channels: no authorized use case in this slice. Existing Context connection and Eve build are acceptance boundaries.

### Next16.3.8→16.4.3

Reviewed [16.4.0](https://github.com/vercel/next.js/releases/tag/v16.4.0), [16.4.1](https://github.com/vercel/next.js/releases/tag/v16.4.1), [16.4.2](https://github.com/vercel/next.js/releases/tag/v16.4.2) and [16.4.3](https://github.com/vercel/next.js/releases/tag/v16.4.3). Match environment loader exactly. Select patched Server Action/image/cache handling and existing navigation/revalidation/build fixes, verifying actual private profiles/conversations. Defer Cache Components/Instant Navigation, private caching, compiler plugins and chunking changes: owner-private caching needs its own governed design. Existing dynamic authorization remains authoritative.

### Actions

Reviewed [download-artifact](https://github.com/actions/download-artifact/releases) v5–v8: select digest enforcement with explicit `digest-mismatch: error`, Node24 and Retry-After handling. Hosted Ubuntu runners support its runtime. Keep pattern downloads in separate project directories; v5 single-ID layout changes do not apply. Defer direct downloads/skip-decompress/CJK names because producers emit zipped ASCII-named reports. ESM migration stays internal. Verify producer success and all four report inventories after download.

Reviewed [setup-node7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0): select manifest retry/version validation. Defer mise/absolute file paths because existing root `.node-version` is the single source.

### Development and transitive fixes

Adopt PR57 Playwright1.64.1 in app/renderer, axe4.14.0, MCP client2.4.0, Tailwind/PostCSS4.3.3 and Vitest5.0.5. Review upstream intervening notes before acceptance; retain accessibility and four-WebKit-profile checks, without new browsers/tools/styles or a Vitest browser runner. Patch compatible Undici7 copies to7.30.1 and Vite to at least8.3.3. Preserve Undici6/8 consumer boundaries. Glob13→14, minimatch3/5/10→11 and KaTeX0.16→0.18 require explicit consumer compatibility tests: archive extraction and math are used, so a blind override is insufficient. Track unresolved findings explicitly.

## Branch assessment

`fix/chat-research-parity` at6995898a is the exact merged [PR18](https://github.com/mcteer/turas/pull/18) head, squash2f0b3228 on main. Missing original ancestry is squash history, not lost implementation; it is eligible for retirement.

`016-legacy-parity-integration` at3f4c677d changes940 paths from merge base64e0bca1. It is not an ancestor of a merged PR head; later parity/hardening releases overlap but do not alone prove every delta superseded. Preserve branch and private full Git bundle until all unique work is assessed. Never merge its old tree wholesale: doing so would reverse later runtime/governance/production changes.

## Vercel assessment

Metadata only was printed; credential values remain private.

| Project | Records | Decision |
| --- | --- | --- |
| turas |75, including25 branch overrides | Keep canonical app;25 overrides target absent chore/eve-dependabot-composer. Remove only after checking review-resource/acceptance dependencies. |
| turas-pilot-backup-0ddc6e7 |37, including14 capture keys | Keep current backup operator: feature020 records latest release source and unchanged12-hour schedule. Historical name establishes no redundancy. |
| turas-recovery-operator |66, including30 capture keys | Defer retirement until archive/key/target-integration retention is reconciled. No Git link does not establish non-use. |

Do not remove PILOT runtime settings by name: scanner signatures/images/costs, Blob credentials and job configuration remain production dependencies. Check the disabled pilot-login flag against current code before removal. Preserve TURAS_DEMO_PASSWORD: one sensitive record correctly targets Production and Preview. Baseline database/store/maintenance/session/account records differ by environment and are not duplicates merely because keys repeat.

### Development release review completed

Reviewed upstream [Playwright1.64](https://github.com/microsoft/playwright/releases/tag/v1.64.0) and1.64.1, [axe4.14](https://github.com/dequelabs/axe-core/releases/tag/v4.14.0), [MCP2.4](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0), [Tailwind4.3.1–3](https://github.com/tailwindlabs/tailwindcss/releases/tag/v4.3.3), and Vitest5.0.3–5.0.5. Keep Playwright default snapshot failure policy and existing four browser profiles; screen-descriptor and hidden-iframe changes require actual WebKit runs. Defer WebMCP and additional request-cookie APIs: existing governed read-only MCP is the authorized surface. Adopt axe's default label-content-name checks and false-positive fixes through existing accessibility suites; defer new locale/tag-specific features where no localized compliance target is configured. Adopt CSS compilation/focus fixes; defer CLI watch/poll/silent and new mixin authoring because current builds use PostCSS. Adopt Vitest mock-security/cleanup/cancellation fixes; defer experimental UI themes/dependency-cache/browser-runner features. MCP client metadata/protocol fixes apply through the existing protocol tests; defer Skills over MCP and token-refresh scope hooks because Turas publishes a finite read-only tool contract, not skills or an Entra OAuth workflow. Preserve protocol2026-07-28 and current server version unless compatibility testing establishes a required coordinated update.

### Initial alert disposition map

Alerts10–12 (Next),13/33 (Zod),14/16/18/20/22/24/26/28/36/37/38/39/42/43 (Undici),8/9 (Vitest mocker), and3–7 plus2 (Vite) are addressed by selected installed versions, subject to final CI/hosted validation. Alert30 (glob),31/32 (minimatch), and1 (KaTeX) remain explicit consumer-compatibility work. Reconcile exact final GitHub alert state after merge; do not dismiss records to make counts agree.
