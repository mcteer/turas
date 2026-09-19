# Evidence and correctness audit

19 September 2026. This is the current audit record; the original `ROADMAP.md` and `HANDOFF.md` contain explicitly marked historical baselines.

## Findings and changes

| Finding | Correction |
| --- | --- |
| Invented operating details were attached to real-company-like names. | Fictional accounts are now Alderwick Labs, Brindlepath Software and Morrowfen Media. Real-company aliases were removed. Existing IDs remain stable for bookmarks and decision references. |
| Real customer questions could consume fictional history. | The resolver separates the public inventory from fictional accounts. Turi retrieves cited public evidence by canonical ID and must not reuse old fictional transcripts as customer facts. |
| Public adoption could be mistaken for a formal maturity assessment. | Workload scope, publication/review dates, unknown formal maturity and unavailable internal engagement fields are explicit in the UI and tools. Source conflicts remain visible. |
| A 40-hour intervention recommendation could omit the constrained skill. | The engagement view shows the proposed start and four schedulable enablement hours. Turi must retrieve capacity before recommending a staffed intervention. |
| Replacement effort could be confused with additional effort or cash savings. | Scenario controls, instructions, memo and evaluations distinguish $22k replacement contribution from $12k additive contribution, and allocated cost from cash cost. |
| Memo lacked a numerical function P&L example. | Memo now uses the shared annual calculator and distinguishes full annual costs from engagement contribution. |
| Engagement/research links dropped their selected context. | Valid canonical IDs now prefill the chat composer; nothing is sent automatically. Public account links use the same mechanism. |
| A completed tool label could say a decision was recorded after denial or conflict. | An explicit output schema and outcome-dependent label distinguish recorded, denied, conflict and not-found results. |
| One research citation did not resolve. | The Eve approval reference now points to the verified primary repository documentation. The source pack remains a limited reviewed reference set, not live research. |
| Pricing-floor calculations accepted non-finite inputs. | NaN and infinities are rejected, with regression coverage. |
| Session failure logs hid the diagnostic category. | Login logs now include a controlled error category, execution phase and SQLSTATE when available, without messages, stacks, credentials or connection strings. |
| Release docs described already-completed login and Preview work as missing. | Current validation records and historical-baseline notices replace those misleading status claims. |

## Data boundaries and rollback

The public inventory is versioned application data, with no database migration or production-data mutation. The fictional fixture version changed to `2026-09-19.2`; stale decision proposals must be reviewed again. Existing transcript content is not rewritten or deleted. Legacy IDs containing earlier customer names refer only to invented scenarios.

For rollback, retain corrected fictional names and real-customer evidence boundaries. Disable the public view/tools if necessary rather than restoring aliases that attach fictional operational claims to real companies. Deploy and verify only in the **Turas** project.

## Validation

- Unit suite: 18 checks pass, including source-count reconciliation, aliases, unknown states, Notion's separate workloads, explicit conflicts, stable fictional IDs, financial arithmetic and non-finite inputs.
- Playwright: 17 checks pass; the unavailable-database check also passes in a separate deliberately invalid-configuration run. Desktop/mobile screenshots were inspected for customer inventory, Notion details, fictional engagement and memo. Browser checks cover protected routes, search, empty/invalid filters, source links and unsent chat context.
- TypeScript and Webpack production build pass.
- Live evaluations: all 10 pass, with 66 gates. After the owner replaced the expired Preview database connection string, hosted Preview `57a4f94` passed reviewer login, public customer screens, responsive/empty/directory-only states, live Notion evidence boundaries, transcript reload, test-chat archival and logged-out access denial. No Production environment changes or promotion occurred. See `RELEASE_CHECKLIST.md` for deployment evidence.

## Remaining production work

These pre-existing gaps are not resolved by correcting evidence presentation, and must not be described as complete:

- Replace browser-supplied Eve session binding with server-established ownership before use with sensitive operational records. The recent chat fix orders metadata persistence before streaming; it does not close every binding attack path.
- Make decision idempotency atomic and scoped by environment/workspace/actor, including payload-conflict checks. The current check-then-insert implementation is not a production concurrency guarantee.
- Make schema migration execution transactional and safe under concurrent startup; define operator-controlled rollout and rollback.
- Complete SSO, organization/account authorization, login abuse controls, CSRF review and security monitoring before employee/customer use.
- Rehearse hosted owner approval, replay, durable persistence and cross-user isolation against the intended environment. The hosted reviewer chat checks alone do not prove these paths.
- Connect governed operational sources before claiming real customer maturity, health, financial terms, capacity, ownership or engagement history. Public sources cannot supply those fields.

This is a bounded repository and public-evidence audit, not certification that the application has no defects. Production promotion remains gated on the outstanding security and hosted decision checks.
