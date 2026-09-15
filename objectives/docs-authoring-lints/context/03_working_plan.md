<working_plan>
<phase name="contract">
- Input: existing loaders, writer runtime, server mutation paths, component schemas.
- Process: fix shared API and rule ownership; capture baseline status and focused tests.
- Output: agent contracts and baseline artifacts. Gate: all implementers agree on API.
</phase>
<phase name="implementation">
- Input: shared API and corpus rules.
- Process: independent Astra slices for model, server, writer, corpus; root implements CLI. No file ownership overlap.
- Output: rule-owned tests and adapters. Gate: positive/negative and draft/completion tests pass.
- Failure handling: coordinate API fixes through engine owner; never duplicate checks in adapters.
</phase>
<phase name="verification">
- Input: completed slices.
- Process: focused tests, import boundaries, typechecks, corpus render/links checks, independent boundary review.
- Output: artifacts/validation notes and final current_state. Gate: no unresolved introduced failures.
- Failure handling: compare baseline for unrelated failures; fix introduced regressions before completion.
</phase>
<stability>
- Update state at milestones and communicate at least every minute. Store test output in artifacts/.
- Tests are bounded rerunnable commands; no custom long-running worker or parameter sweep is needed.
- Strategy: baseline plus behavior matrix across code exclusions, old/new findings, draft/completion, stage/accept, and CLI. Broad numerical optimization does not apply.
</stability>
</working_plan>
