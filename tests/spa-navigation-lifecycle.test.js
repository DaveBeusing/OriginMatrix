import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SpaNavigationLifecycle } from "../src/background/spa-navigation-lifecycle.js";

test("registers generic same-document navigation events", () => {
  const registrations = [];
  const lifecycle = new SpaNavigationLifecycle({ sendMessage: async () => {} });
  lifecycle.start({
    onHistoryStateUpdated: { addListener: (listener) => registrations.push(listener) },
    onReferenceFragmentUpdated: { addListener: (listener) => registrations.push(listener) },
  });
  assert.equal(registrations.length, 2);
});

test("manifest grants the lifecycle navigation events without browsing history access", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.permissions.includes("webNavigation"));
  assert.equal(manifest.permissions.includes("history"), false);
});

test("debounces route changes and re-evaluates only the latest URL", async () => {
  const scheduled = [];
  const cancelled = [];
  const messages = [];
  const navigations = [];
  const lifecycle = new SpaNavigationLifecycle({
    sendMessage: async (...args) => messages.push(args),
    onTopFrameNavigation: async (details) => navigations.push(details.url),
    schedule(callback, delay) { scheduled.push({ callback, delay }); return scheduled.length; },
    cancel: (handle) => cancelled.push(handle),
  });
  assert.equal(lifecycle.handle({ tabId: 4, frameId: 0, url: "https://example.com/watch?v=A", timeStamp: 10 }), true);
  assert.equal(lifecycle.handle({ tabId: 4, frameId: 0, url: "https://example.com/watch?v=B", timeStamp: 20 }), true);
  assert.deepEqual(cancelled, [1]);
  assert.equal(scheduled[1].delay, 75);
  await scheduled[1].callback();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(navigations, ["https://example.com/watch?v=B"]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0], 4);
  assert.deepEqual(messages[0][2], { frameId: 0 });
  assert.equal(messages[0][1].type, "ORIGINMATRIX_SPA_NAVIGATION");
  assert.match(messages[0][1].navigationId, /^20:/);
});

test("ignores unsupported URLs and does not reset top-frame state for subframes", async () => {
  const scheduled = [];
  let topFrameNavigations = 0;
  const messages = [];
  const lifecycle = new SpaNavigationLifecycle({
    sendMessage: async (...args) => messages.push(args),
    onTopFrameNavigation: async () => { topFrameNavigations += 1; },
    schedule(callback) { scheduled.push(callback); return scheduled.length; },
  });
  assert.equal(lifecycle.handle({ tabId: 2, frameId: 0, url: "chrome://settings", timeStamp: 1 }), false);
  assert.equal(lifecycle.handle({ tabId: 2, frameId: 3, url: "https://frame.example/#next", timeStamp: 2 }), true);
  await scheduled[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(topFrameNavigations, 0);
  assert.deepEqual(messages[0][2], { frameId: 3 });
});

test("reports failed SPA delivery with navigation context", async () => {
  const scheduled = [];
  let failure;
  const lifecycle = new SpaNavigationLifecycle({ sendMessage: async () => { throw new Error("receiver unavailable"); }, onError: (error, navigation) => { failure = { error, navigation }; }, schedule(callback) { scheduled.push(callback); return scheduled.length; } });
  lifecycle.handle({ tabId: 7, frameId: 0, url: "https://example.com/next", timeStamp: 5 });
  await scheduled[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(failure.error.message, /receiver unavailable/);
  assert.equal(failure.navigation.tabId, 7);
});
