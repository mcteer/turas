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
- Controlled native wire events establish UI behavior, not provider completion. Existing actual native question/steering/cancellation gates remain required in CI.

## Hosted release gates

Independent final review passes with18 exact source SHA256 bindings and no remaining blocker. Exact Preview, final-source CI, merge tree/branch cleanup and authenticated Production checks remain pending. Do not infer hosted behavior from local captures. Final release receipts and exact deployed revisions must be recorded before release completion.
