import { expect, test } from "bun:test";
import { createSharedEvents } from "../data/shared-events";

function fixture() {
  const target = new EventTarget();
  const visibility = Object.assign(target, { visibilityState: "visible" as DocumentVisibilityState });
  let active = 0;
  let connections = 0;
  let send = (_event: string) => {};
  const subscribe = createSharedEvents<string>((deliver) => {
    active++;
    connections++;
    send = deliver;
    return () => { active--; };
  }, "refresh", visibility);
  return {
    subscribe,
    get active() { return active; },
    get connections() { return connections; },
    send: (event: string) => send(event),
    show: (state: DocumentVisibilityState) => {
      visibility.visibilityState = state;
      visibility.dispatchEvent(new Event("visibilitychange"));
    },
  };
}

test("document and lab subscribers share one connection until both unsubscribe", () => {
  const f = fixture();
  const documentEvents: string[] = [];
  const labEvents: string[] = [];
  const stopDocument = f.subscribe(event => documentEvents.push(event));
  const stopLab = f.subscribe(event => labEvents.push(event));
  expect(f.active).toBe(1);
  f.send("changed");
  expect(documentEvents).toEqual(["changed"]);
  expect(labEvents).toEqual(["changed"]);
  stopDocument();
  expect(f.active).toBe(1);
  stopLab();
  expect(f.active).toBe(0);
});

test("hidden tabs free connections and refresh both consumers on return", () => {
  const f = fixture();
  f.show("hidden");
  const events: string[] = [];
  const stop = f.subscribe(event => events.push(event));
  expect(f.active).toBe(0);
  f.show("visible");
  expect(f.active).toBe(1);
  f.show("hidden");
  expect(f.active).toBe(0);
  f.show("visible");
  expect(f.active).toBe(1);
  expect(events).toEqual(["refresh", "refresh"]);
  expect(f.connections).toBe(2);
  stop();
  f.show("hidden");
  f.show("visible");
  expect(f.active).toBe(0);
});
