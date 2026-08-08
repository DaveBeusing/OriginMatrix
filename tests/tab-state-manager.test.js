import test from "node:test";
import assert from "node:assert/strict";
import { TabStateManager, normalizeResourceType } from "../src/background/tab-state-manager.js";

function memoryStorage() {
  const data = {};
  return {
    async get(key) { return { [key]: data[key] }; },
    async set(values) { Object.assign(data, structuredClone(values)); },
  };
}

test("records domains, resource types, and reliable outcomes", async () => {
  const manager = new TabStateManager(memoryStorage());
  await manager.startNavigation({ tabId: 4, url: "https://example.com/", timestamp: 1 });
  await Promise.all([
    manager.recordRequest({ tabId: 4, url: "https://cdn.example.com/app.js", type: "script", timestamp: 2 }),
    manager.recordRequest({ tabId: 4, url: "https://analytics.test/collect", type: "xmlhttprequest", timestamp: 3 }),
  ]);
  await manager.recordOutcome({ tabId: 4, url: "https://cdn.example.com/app.js", outcome: "completed", timestamp: 4 });
  await manager.recordOutcome({ tabId: 4, url: "https://analytics.test/collect", outcome: "failed", timestamp: 5 });

  const state = await manager.get(4);
  assert.equal(state.topDomain, "example.com");
  assert.equal(state.totalRequests, 2);
  assert.equal(state.completedRequests, 1);
  assert.equal(state.failedRequests, 1);
  assert.equal(state.domains["cdn.example.com"].types.script, 1);
  assert.equal(state.domains["analytics.test"].types.xmlhttprequest, 1);
});

test("new main-frame navigation resets previous observations", async () => {
  const manager = new TabStateManager(memoryStorage());
  await manager.startNavigation({ tabId: 8, url: "https://first.test/" });
  await manager.recordRequest({ tabId: 8, url: "https://cdn.test/a.js", type: "script" });
  await manager.startNavigation({ tabId: 8, url: "https://second.test/" });
  const state = await manager.get(8);
  assert.equal(state.topDomain, "second.test");
  assert.equal(state.totalRequests, 0);
  assert.deepEqual(state.domains, {});
});

test("maps advanced and unknown webRequest types", () => {
  assert.equal(normalizeResourceType("websocket"), "websocket");
  assert.equal(normalizeResourceType("main_frame"), "other");
});
