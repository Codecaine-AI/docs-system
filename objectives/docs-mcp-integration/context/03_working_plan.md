# Working Plan
1. Baseline: preserve status inventory; inspect services and client protocols. Gate: ownership and contracts agreed.
2. Implement parallel bounded tracks: tools, guidance, client installer, coordination; parent owns discovery and transport. Gate: compile and focused tests. Fix contract failures before integration.
3. QA: protocol tests, concurrency/root isolation, client setup in temp homes, internal-agent regressions; independent review. Gate: no unresolved correctness failures.
4. Dogfood: use MCP to add accurate integration docs to Docs System and a relevant Core corpus. Gate: read back and final lint checks.
5. Deliver: concrete station HTML with paths, commands, evidence, limitations; open Chrome.
Validation uses contract-focused tests and a real workflow, not optimization sweeps. Log commands/results in artifacts and current_state. Tests are bounded and repeatable; daemon exposes health/status/stop.
