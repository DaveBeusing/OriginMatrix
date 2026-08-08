import test from "node:test";
import assert from "node:assert/strict";
import { RequestObserver } from "../src/background/request-observer.js";

function event() {
  return {
    listener: null,
    addListener(listener) { this.listener = listener; },
  };
}

test("registers non-blocking listeners and forwards a request lifecycle", async () => {
  const calls = [];
  const manager = {
    async startNavigation(input) { calls.push(["navigation", input]); },
    async get() { return { topUrl: "https://example.com/" }; },
    async recordRequest(input) { calls.push(["request", input]); },
    async recordOutcome(input) { calls.push(["outcome", input]); },
  };
  const webRequest = { onBeforeRequest: event(), onCompleted: event(), onErrorOccurred: event() };
  new RequestObserver({ tabStateManager: manager, getTab: async () => null }).start(webRequest);
  const details = { tabId: 3, requestId: "r1", url: "https://example.com/", type: "main_frame", timeStamp: 1 };
  webRequest.onBeforeRequest.listener(details);
  await webRequest.onCompleted.listener({ ...details, timeStamp: 2 });

  assert.deepEqual(calls.map(([name]) => name), ["navigation", "request", "outcome"]);
  assert.equal(calls[2][1].outcome, "completed");
});
