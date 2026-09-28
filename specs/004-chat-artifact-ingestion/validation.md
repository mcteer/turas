# 004 implementation validation

Local implementation validation passed. These checks use synthetic data
and a disposable test database/store. They do not establish hosted readiness or
permission to process real customer data. The selected application database was
left at schema 013; the recovery drill upgraded a clone to schema 018.

## Setup and dependency decisions

- The separate private parser package pins officeparser 8.0.0 (MIT), pdfjs-dist
  6.3.289 (Apache-2.0), @napi-rs/canvas 1.0.9 (MIT), tesseract.js 7.0.0
  (Apache-2.0), exceljs 4.4.0 (MIT), csv-parse 7.0.3 (MIT), file-type 22.1.1
  (MIT) and yauzl 3.4.0 (MIT). It runs on Node 24, outside the web bundle.
- ExcelJS pulls `uuid`; override to 11.1.1 because the older range produced a
  moderate buffer-bounds advisory. `npm audit --audit-level=moderate` then found
  zero reported vulnerabilities. Older transitive deprecation notices remain;
  parser work stays in a constrained container.
- PDF rendering uses the pinned @napi-rs/canvas native adapter. Its PNG smoke test
  passed on local Node 24 and inside the parser container with network off,
  read-only root, a non-root user and resource limits.
- Parser base: Node 24.13.0 bookworm slim index digest
  `sha256:4660b1ca8b28d6d1906fd644abe34b2ed81d15434d26d845ef0aced307cf4b6f`.
  Scanner base: ClamAV 1.5.4 Debian 13 slim index digest
  `sha256:9bb8712a50f0e75166e936c452cd82dd5e5be0b85586598930b5bbb84a99a578`.
  Both images built locally; the scanner reports ClamAV 1.5.4.
- The English OCR data is pinned to tessdata_fast commit
  `87416418657359cb625c412a48b6e1d6d41c29bd`, SHA-256
  `7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2`
  (Apache-2.0). Preparation keeps it in the ignored private local store. It was
  downloaded and digest-checked. OCR of synthetic normal/rotated images and a
  scanned PDF passed through the parser adapter. The constrained container OCR
  smoke used only the input and language data mounts.
- FreshClam prepared and verified a local signature snapshot on 2026-09-28.
  The scanner reported daily version 28137. The clamd wrapper enforces the
  seven-day database age and scan limits. Under network-free, read-only,
  non-root, bounded container flags, it returned clean for a synthetic text file
  and detected the generated EICAR canary. A synthetic contract upload later
  passed through scanner and parser to immutable publication in the disposable
  test database; the local images need rebuilding after subsequent parser edits.
- The ignored fixture generator made 21 synthetic inputs. Officeparser opened
  DOCX and PPTX; ExcelJS opened the workbook and retained its formula/cached
  result and hidden sheet; PDF.js opened both text and image PDFs. PNG/JPEG OCR
  read the synthetic invoice. The tracked expected-source manifest lists every
  format and canary.

## Checks run so far

| Check | Result |
| --- | --- |
| 004 Spec Kit prerequisites and requirements checklist | Pass; 16/16 checked |
| Node 24 parser `npm ci`, build and native canvas test | Pass; 1 test |
| Parser and scanner image builds; constrained container canvas/scanner version | Pass |
| Constrained clean and EICAR scanner runs; offline container OCR | Pass |
| Synthetic corpus generation and DOCX/PPTX/XLSX/PDF parser probes | Pass; 21 inputs |
| Parser dependency audit at moderate threshold | Pass; zero reported vulnerabilities |
| Root `npm run typecheck` | Pass |
| Focused config and container-policy unit tests | Pass; 8 tests |
| Artifact DTO boundary tests, observed failing before implementation | Pass; 6 tests |
| Extraction manifest validation tests, observed failing before implementation | Pass; 3 tests |
| 014/015 schema SQL against current disposable 013 database in a rolled-back transaction | Pass; no persisted change |
| Disposable 013→015 migration, grants and selection-range trigger | Pass; selected application database untouched |
| Foundation migration/policy/intake/jobs/lifecycle integration tests | Pass |
| Real scanner/parser gate, `npm run test:artifacts` | Pass; 39 checks plus live container isolation, deadline and memory-kill probes, local pinned images and offline OCR |
| Root unit suite | Pass; 66 tests |
| Root contracts suite, run alone | Pass; 45 tests, including streamed-read revocation |
| Root integration suite, run alone | Pass; 120 tests, one existing opt-in restart test skipped |
| Exact selection, Pending proposal, acceptance and withdrawn support | Pass in contract/integration tests and live synthetic evaluation |
| Guarded recovery, `npm run artifacts:recovery:check` | Pass; schema 013 clone upgraded to 018, reclaimed run and cleanup convergence; selected database/store and `.eve/.workflow-data` untouched |
| Root `npm run typecheck`, `npm run check:docs`, `git diff --check` | Pass after story changes |
| Root `npm run build:check`, `npx eve eval --list` | Pass locally; build skips sandbox prewarm |
| Bounded live 004 behavior evaluation and scored review | Pass; 8/8 cases, 9 model steps, max 957 output tokens/step, max 19.7 seconds/case, all hard gates and ≥7/8 semantic scores |
| CLI WebKit artifact composer/review/context/lifecycle focused runs | Pass across four browser projects; synthetic screenshots inspected |
| Full CLI WebKit regression, `npm run test:ui` | Pass; 121 passed, 55 intentional skips across four desktop/mobile light/dark projects; artifact screenshots inspected |
| Isolated real WebKit upload, `npm run artifacts:ui:live:check` | Pass; panel uploaded `simple.txt` through intent/bytes/completion, worker scanned and extracted it, UI attached and inspected exact units, and one unit was selected for chat in 11.2 seconds; screenshot inspected |

The initial simultaneous contract/integration run failed from shared disposable
database contention and left a committed synthetic research source. The suites
were rerun sequentially. A research expectation now checks its own source and
the superseded revision, so unrelated test fixtures cannot satisfy or break it.
An expiry contract check found that the intent reservation release was rolled
back with its HTTP conflict. The transition now commits before reporting the
error. A focused HTTP regression verifies cancellation, expiry, replay, null
version links, no queued run and unchanged reserved quota; it passes.
One repeat full integration run hit the existing 30-write/minute profile limit
inside a synthetic history fixture after many commands in one transaction.
The fixture now clears only its disposable test-environment profile-write window
before its final independent phase; the full integration suite was rerun.
The first PR CI run stopped before tests: FreshClam dropped to UID 1000 and could
not write the fresh signature directory owned by the Linux runner. Preparation
now temporarily grants write access to that directory under the 0700 private
store, then restores 0755 even on failure. CI rerun is required to verify the
Linux preparation and subsequent gates. The second CI run prepared signatures
and passed docs, types and unit checks, then the clean scanner integration
fixture failed on Linux. The test had mounted its private 0600 source directly,
while the worker stages a read-only 0444 copy for non-root containers. The
scanner test and container probe now follow that staging pattern; a focused
scanner run, typecheck and all 39 local artifact checks pass. Linux CI must
verify the remaining gates.
The full live evaluation used an isolated copied app, private Eve directory,
disposable schema-018 database and store. Its copied evaluation agent kept the
root selected Grok model and capped generation to 1,000 tokens to leave room for
provider output accounting; `agent/agent.ts` was unchanged. The first full
attempt stopped when a provider-reported OCR step exceeded the 1,200-token hard
limit despite a 1,200 generation setting. The final run passed after the
evaluation-only cap and case prompts were tightened. Captured responses and
the four-dimension review are under ignored `local-artifacts/`.

Withdrawal left the old history route at HTTP 200 with only owner-authored text,
`contextStatus=changed`, and the generic title; no generated event was released.
The old native session rejected a new send with HTTP 409. The live gate verifies
payload redaction as well as the send denial.

Race and access coverage spans the artifact intake, job, policy, review,
context-fence, cleanup and existing profile-context suites. The ordinary
four-project artifact UI suites exercise presentation and error states with
synthetic route fixtures. The separate isolated WebKit journey exercises real
HTTP intake, scanner/parser publication and exact-unit selection. Neither local
check proves hosted storage, native provider-record erasure, or real-customer
retention policy.
