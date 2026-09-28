# 003 synthetic usability walkthrough

Status: not conducted. No participant scores or timings are recorded yet.

Local synthetic fixture prepared on 2026-09-27 with
`npm run db:seed-profile-walkthrough`: Juniper
`00000000-0000-4000-8000-000000000241` has 25 accepted records, workloads
`4519e54c-8400-4d0f-9a31-1c3ffb89f4cc` and
`17207690-95be-48cc-a6fd-deea1aa7af4b`, open risk record
`3a5a517b-ef60-4d71-9155-e630963406f9`, attributed research revision
`6d1e693f-8ad1-4b50-8fa0-eb06b9544eef`, and a confirmed conflict
between revisions `75101ed0-bfb9-45d8-b56d-d2a7e3ed5a1e` and
`8d1d34ee-681c-43a4-8ec9-2fa7fcbca957`. The next review action is
“Confirm rollback owner and record rehearsal outcome.” A separate claim stays
Pending for review. These IDs apply to the current local database; use the IDs
printed by the seed command after restoring or recreating it.

Use five actual internal reviewers and a synthetic profile with two workloads and
25 mixed accepted records. Give each participant the same starting route and
task wording, without explaining where the answers are. Do not use real customer
data. Record only participant labels P1–P5, elapsed time and whether each answer
matches the accepted profile; do not record names, chat text or credentials.

## Discovery task (SC-001)

Start at the customer directory. Ask the participant to find the current product
use, known maturity states, top open delivery risk and next review action, and
to explain what Unknown means. Stop at three minutes. Passing requires all four
items and no confusion of Unknown with a negative assessment. Target: 5/5 for
the five-person 90% threshold.

## Review task (SC-006)

Show one accepted claim, one attributed research source, one Pending proposal and
one confirmed conflict in the same synthetic customer. Ask the participant to
identify each state and make one routine exact-candidate review decision. Stop
at two minutes. Passing requires correct state distinctions and a completed
review with no unsupported approval. Target: 5/5.

| Participant | Discovery seconds | Discovery pass | Review seconds | Review pass | Notes without personal data |
| --- | ---: | :---: | ---: | :---: | --- |
| P1 | — | — | — | — | Not run |
| P2 | — | — | — | — | Not run |
| P3 | — | — | — | — | Not run |
| P4 | — | — | — | — | Not run |
| P5 | — | — | — | — | Not run |

Do not convert the blank rows into pass claims. Record the fixture revision IDs,
date, browser/viewport and any usability changes before calculating SC-001 and
SC-006 outcomes.
