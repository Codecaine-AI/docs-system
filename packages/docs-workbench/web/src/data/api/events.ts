import { IS_STATIC } from "./http";
import { getSessionId } from "../session";
import { createSharedEvents } from "../shared-events";

// ---------------------------------------------------------------------------
// SSE change events (serve only)
// ---------------------------------------------------------------------------

/** One `/api/events` frame — mirrors docs-server's DocsChangeEvent. */
export type DocsChangeEventFrame = {
  path: string;
  changedIds: string[];
  patchId: string;
  actor: string;
};

function parseEventFrame(data: string): DocsChangeEventFrame | null {
  try {
    const parsed = JSON.parse(data) as Partial<DocsChangeEventFrame>;
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      path: typeof parsed.path === "string" ? parsed.path : "",
      changedIds: Array.isArray(parsed.changedIds)
        ? parsed.changedIds.filter((id): id is string => typeof id === "string")
        : [],
      patchId: typeof parsed.patchId === "string" ? parsed.patchId : "",
      actor: typeof parsed.actor === "string" ? parsed.actor : "",
    };
  } catch {
    return null;
  }
}

/**
 * Fallback SSE consumer over `fetch` streaming, for environments without a
 * native `EventSource` (happy-dom test/smoke runs). Only default (unnamed)
 * events are delivered — the server's named "connected"/"keepalive" frames
 * are dropped exactly like EventSource's `onmessage` would drop them.
 */
function subscribeViaFetchStream(
  url: string,
  onEvent: (event: DocsChangeEventFrame) => void,
): () => void {
  const controller = new AbortController();
  let stopped = false;
  let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const consume = async () => {
    while (!stopped) {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: "text/event-stream" },
        });
        if (!response.ok || !response.body) throw new Error(`SSE connect failed: ${response.status}`);
        const reader = response.body.getReader();
        activeReader = reader;
        if (stopped) {
          await reader.cancel().catch(() => {});
          return;
        }
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          // Over a socket chunks are bytes; an in-process handler (tests,
          // smoke harnesses driving `app.handle`) may yield strings.
          buffer +=
            typeof value === "string" ? value : decoder.decode(value, { stream: true });
          let boundary: number;
          // SSE frames are separated by a blank line.
          while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
            const rawFrame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, "");
            let eventName = "message";
            const dataLines: string[] = [];
            for (const line of rawFrame.split(/\r?\n/)) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
            }
            if (eventName !== "message" || dataLines.length === 0) continue;
            const frame = parseEventFrame(dataLines.join("\n"));
            if (frame) onEvent(frame);
          }
        }
      } catch {
        // Connection dropped/aborted — fall through to the reconnect delay.
      }
      if (stopped) return;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));
    }
  };
  void consume();

  return () => {
    stopped = true;
    controller.abort();
    // Cancelling the reader resolves any pending read() with done:true even
    // when the server never observes the abort signal (in-process handlers).
    void activeReader?.cancel().catch(() => {});
  };
}

function connectDocsEvents(deliver: (event: DocsChangeEventFrame) => void): () => void {
  if (typeof EventSource !== "undefined") {
    const source = new EventSource(`api/events`);
    source.onmessage = (event) => {
      const frame = parseEventFrame(String(event.data));
      if (frame) deliver(frame);
    };
    return () => source.close();
  }
  return subscribeViaFetchStream(`api/events`, deliver);
}

const subscribeSharedDocsEvents = createSharedEvents<DocsChangeEventFrame>(
  connectDocsEvents,
  { path: "", changedIds: [], patchId: "", actor: "" },
  typeof document === "undefined" ? undefined : document,
);

/**
 * Share one change stream in a visible tab; refresh after a hidden interval.
 * Own mutations are filtered because their responses already updated state.
 * Static exports have no server and return a no-op unsubscribe function.
 */
export function subscribeDocsEvents(
  onEvent: (event: DocsChangeEventFrame) => void,
): () => void {
  if (IS_STATIC) return () => {};
  const sessionId = getSessionId();
  return subscribeSharedDocsEvents((frame) => {
    if (frame.actor !== sessionId) onEvent(frame);
  });
}

