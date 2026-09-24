/** Keep one live connection per visible tab, regardless of UI subscribers.
 * Hidden tabs release their HTTP/1 connection and refresh when shown again.
 */
export function createSharedEvents<T>(
  connect: (deliver: (event: T) => void) => () => void,
  refreshEvent: T,
  visibility: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> | undefined,
) {
  const listeners = new Set<(event: T) => void>();
  let disconnect: (() => void) | undefined;
  let paused = false;
  const deliver = (event: T) => {
    for (const listener of [...listeners]) listener(event);
  };
  const sync = () => {
    if (visibility?.visibilityState === "hidden") {
      paused = true;
      disconnect?.();
      disconnect = undefined;
    } else if (listeners.size && !disconnect) {
      disconnect = connect(deliver);
      // Changes may have happened while this tab had no live connection.
      if (paused) deliver(refreshEvent);
      paused = false;
    }
  };
  return (listener: (event: T) => void) => {
    // A separate wrapper allows independent subscriptions of one callback.
    const subscription = (event: T) => listener(event);
    listeners.add(subscription);
    if (listeners.size === 1) {
      visibility?.addEventListener("visibilitychange", sync);
      sync();
    }
    return () => {
      listeners.delete(subscription);
      if (!listeners.size) {
        visibility?.removeEventListener("visibilitychange", sync);
        disconnect?.();
        disconnect = undefined;
        paused = false;
      }
    };
  };
}
