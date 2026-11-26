import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Bun's own fetch API, captured before Happy DOM replaces it with browser
// versions (CORS checks, forbidden request headers). Server transport tests
// that run under this preload swap these in for their file instead of
// unregistering Happy DOM: a re-registered window breaks the DOM tests that
// run later in the same process.
const bunFetchApi = {
  fetch: globalThis.fetch,
  Request: globalThis.Request,
  Response: globalThis.Response,
  Headers: globalThis.Headers,
  AbortController: globalThis.AbortController,
  AbortSignal: globalThis.AbortSignal,
};
(globalThis as Record<symbol, unknown>)[Symbol.for("docs-system.bunFetchApi")] = bunFetchApi;

GlobalRegistrator.register();
