# Data Model

No persisted entities or schema changes. The immutable shared telemetry policy has
`recordInputs: false` and `recordOutputs: false`. Structural usage remains diagnostic;
full results and provider accounting metadata remain available only to existing callers.
