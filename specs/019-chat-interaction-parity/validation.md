# Chat interaction parity validation

## Scope and traceability

Read-only legacy reference fd1e205d7fd258676d6fb12b3ade8a431d53a6af; starting current main8168e74. The source comparison is in research.md. Current appearance, root model, authorization, native execution, explicit decision rights and unknown accounting holds are preserved. No database migration or grant change is needed; schema77 remains required.

## Local evidence

- Specification, plan, tasks and contract consistency review: no unresolved critical/high gap; built-in requirements checklist5/5 complete. Spec Kit prerequisites pass.
- Configured full unit suite:147 files,653 tests pass, including27 focused history/input/activity/status cases. The initial unconfigured run had two environment-configuration failures; its evidence is preserved separately.
- Full TypeScript check passes after installing existing locked dependencies; no dependency/version change.
- Documentation check:228 authored Markdown files and tracked-file hygiene pass; rerun required after final documentation.
- Complete controlled-wire WebKit gate:52/52 cases pass across desktop/mobile and both themes, zero failures/skips/retries. Private captures were inspected for composer, reading and inline question presentation; current theme and layout are preserved.
- The additional concurrent preparation regression passes4/4 WebKit projects, with zero skips/retries, on the final button-state change. Its initial run failed before reaching the intended race because native files were disabled in the fixture. The corrected fixture exposed a real Send-button state mismatch after an older failure during a newer upload: the dispatch guard prevented duplication, but Send incorrectly became enabled. The button now remains disabled; the exact regression rerun passes. Both original reports are preserved.
- Earlier preserved failures include an incorrect wrapper expected-count after40 browser passes, fixture stream/delivery receipt errors, and a genuine question-draft loss caused by the SDK resolving after reporting delivery failure. The draft handling is fixed and passes the52-case gate.
- First exact-source CI WebKit gate passes80/80 cases; six of seven backend parity jobs pass. The native question job exposed a duplicated policy warning in both alert/status locations. It is fixed to render once with alert semantics; the real four-case native question rerun passes with zero paid calls; final-source CI is pending. Original CI and local reproduction failures are preserved.
- Controlled native wire events establish UI behavior, not provider completion. Existing actual native question/steering/cancellation gates remain required in CI.

## Exact Preview interaction acceptance

Reviewed executable source00566fe2bd851fbc4ab50c6dfdfbe8b77b4286de passes seven authenticated real-HTTP/headless WebKit checks on [immutable Preview](https://turas-6l7o07bft-turas-6e414af3.vercel.app): login, file paste/Backspace, drop/removal, link dialog/removal, an existing idle active composer, and retained scroll/reload/latest on desktop dark/mobile light. Saved history/attempts/binding digests are unchanged, no application mutation or model message is sent, logout succeeds and browser resources close. Captures were inspected. Six additional mcteer/panel login checks across immutable, branch and canonical URLs pass, including foreign-origin rejection and unauthenticated denial.

One WebKit diagnostic matches the exact cancelled GET, intentional navigation and actual main-frame navigation within a bounded window. All other browser errors remain failures. Original strict failures, cleanup failures and an owned session-binding timeout are preserved. The timeout-owned application binding is confirmed failed and archived with no assigned native session or admitted turn; no native retirement is claimed. The successful final check uses existing conversations read-only.

## Isolated real profile acceptance target

The required unchanged profile checker found real retained research drift in the original Preview (23 source revisions versus Production10 for one checked account). Existing evidence was preserved. A new database on the existing Preview branch was initialized with the locked schema77 migrations and runtime grants, containing only the authorized real directory/public-source closure. Production and the original Preview database were not changed.

- Encrypted source snapshot:184 real customers,780 public revisions/checks with lifecycle history, original dates and public provenance. Private conversations, uploads, sessions and budget accounts are excluded.
- Genuine PostgreSQL18/pgvector0.8.6 rehearsal: current runtime-authorized domain profile reads match the real Production directory and both required profiles; lexical results match eligible canonical passages/locators. The source comparison's read-only policy adapter preserves authorization predicates but does not claim hosted locking/runtime/search-ranking proof.
- Actual new-target runtime login and all34 effective privilege checks pass. Encrypted hosted backup/authenticated decrypt/restore matches all445 table fingerprints and grants. A first local restore failed on a missing owner-role placeholder; that failure is preserved and the same encrypted dump passes after adding the exact NOLOGIN role only in the owned local container.
- Five new encrypted019-branch Preview overrides are verified: existing authorized budget guard first, blank explicit gateway key, two runtime database URLs and the new environment marker. Global/Production settings remain untouched. No budget account, funding or unknown-hold reset is introduced; the new target has no funded ledger and embeddings reject before reservation, preserving real lexical fallback.

The next Git-connected deployment must pass the unchanged real profile checker on its exact commit, with desktop/mobile captures inspected. This operational acceptance target is not a new validation allowance or a replacement for actual chat interaction proof on the original Preview.

## Remaining release gates

Independent final review passes with18 exact executable/UI/test source SHA256 bindings and no remaining blocker. Final-source CI, exact new-target profile acceptance, merge tree/branch cleanup and authenticated Production checks remain pending. Do not infer hosted provider completion from controlled wire or local checks. Post-merge release completion must record the deployed commit/schema and changed behavior; current schema remains77 with no new application migration.
