import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests run tool calls that append to the shared action log. Point the log at a
// temp file before any test module loads, so no test writes ~/.codecaine/action-log.sqlite.
process.env.CODECAINE_ACTION_LOG = join(mkdtempSync(join(tmpdir(), "docs-test-action-log-")), "action-log.sqlite");
// Service tool calls append call timings the same way: never to ~/.codecaine/call-timings.jsonl.
process.env.CODECAINE_DOCS_CALL_TIMINGS_FILE = join(mkdtempSync(join(tmpdir(), "docs-test-call-timings-")), "call-timings.jsonl");
