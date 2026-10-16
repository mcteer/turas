# Validation

Use Node24. No provider keys are required for deterministic UI tests. Never run mutable UI fixtures against Production or the selected local database.

1. Run focused conversation/display units and npm run typecheck.
2. Run the focused019 check runner against its owned disposable database/app/workflow store, all four WebKit projects; inspect synthetic desktop/mobile screenshots in both themes.
3. Cover long/late/resized messages, escaped scrolling, latest action, reload and separate conversations; tools/questions/authorization; Enter/Shift+Enter/composition, paste/drop/removal, follow-up draft and duplicate-send prevention.
4. Run docs/build and existing relevant chat/history/native question regressions.
5. Record exact Preview commit and authenticated UI/HTTP acceptance, independent review, CI, merge tree and exact Production verification in validation.md. Local intercepted streams establish UI behavior only, not provider/hosted execution.
