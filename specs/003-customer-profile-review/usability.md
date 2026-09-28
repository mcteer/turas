# 003 synthetic profile journey

The 25-record local fixture was prepared on 2026-09-27 with
`npm run db:seed-profile-walkthrough`. Juniper
`00000000-0000-4000-8000-000000000241` has two workloads, current and
evaluating product use, six maturity dimensions, an open high delivery risk,
a next review action, attributed research, a confirmed contradiction and a
separate Pending claim. The seed completed twice with the same record IDs and
accepted count. It contains only synthetic data.

`TURAS_PROFILE_FIXTURE_READY=1 npm run test:ui -- tests/ui/profile-walkthrough.spec.ts --workers=1`
passed **4/4** on desktop and mobile WebKit in light and dark themes. The
script navigates from the customer directory and verifies every SC-001 profile
item and the distinct accepted-research/conflict/Pending states in SC-006.
The full populated-fixture UI run passed **125** tests with **27 intentional
skips** before this new scripted journey was added. The existing
`tests/ui/profile-review.spec.ts` performs real exact-candidate approval and
checks that accepted context changes only after the decision. There are no
human participant results or timing claims; the spec no longer requires them.

Local fixture IDs for reproducing the scripted journey:

| Item | ID or value |
| --- | --- |
| Public web workload | `4519e54c-8400-4d0f-9a31-1c3ffb89f4cc` |
| Commerce checkout workload | `17207690-95be-48cc-a6fd-deea1aa7af4b` |
| Open risk record | `3a5a517b-ef60-4d71-9155-e630963406f9` |
| Research revision | `6d1e693f-8ad1-4b50-8fa0-eb06b9544eef` |
| Conflicting revisions | `75101ed0-bfb9-45d8-b56d-d2a7e3ed5a1e`, `8d1d34ee-681c-43a4-8ec9-2fa7fcbca957` |
| Next review action | Confirm rollback owner and record rehearsal outcome |

These IDs are specific to the current local database. A recreated database
prints its own IDs when seeded.
