import test from "node:test";
import assert from "node:assert/strict";
import { DnrMatchObserver } from "../src/background/dnr-match-observer.js";

function event() { return { listener: null, addListener(listener) { this.listener = listener; } }; }

test("records exact Chrome DNR debug matches through the attribution registry", async () => {
  const calls = [];
  const api = { onRuleMatchedDebug: event() };
  const observer = new DnrMatchObserver({
    tabStateManager: { async recordRuleMatch(input) { calls.push(input); return true; } },
    registry: { resolve() { return { decision: "blocked", engine: "network", source: "EasyList" }; } },
  });
  assert.equal(observer.start(api), true);
  await api.onRuleMatchedDebug.listener({
    request: { tabId: 3, requestId: "r1" },
    rule: { ruleId: 500_001, rulesetId: "_dynamic" },
  });
  assert.deepEqual(calls, [{ tabId: 3, requestId: "r1", ruleId: 500_001, rulesetId: "_dynamic", decision: "blocked", engine: "network", source: "EasyList" }]);
});

test("reports unavailable feedback without fabricating matches", () => {
  const observer = new DnrMatchObserver({ tabStateManager: {}, registry: {} });
  assert.equal(observer.start({}), false);
  assert.equal(observer.available, false);
});
