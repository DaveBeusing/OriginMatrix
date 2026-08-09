import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBreakage } from "../src/diagnostics/breakage-diagnostics.js";

test("detects supported breakage patterns and correlates every protection engine", () => {
  const now = 100_000;
  const signals = [{ type: "media-not-playable", timestamp: now - 100, frameId: 0 }, ...Array.from({ length: 3 }, (_, index) => ({ type: "media-error", timestamp: now - index, frameId: 0 })), ...Array.from({ length: 5 }, (_, index) => ({ type: "spa-navigation", timestamp: now - index, frameId: 0 })), { type: "spa-delivery-failed", timestamp: now - 10, frameId: 0 }];
  const requestLog = Array.from({ length: 10 }, (_, index) => ({ decision: "allowed", timestamp: now - index, reason: "EasyList exception", resourceType: "script", domain: "cdn.test" }));
  const result = analyzeBreakage({ state: { breakageSignals: signals, protectionActions: [{ type: "cosmetic", timestamp: now, source: "plan", details: ".ad" }, { type: "scriptlet", timestamp: now, source: "early", details: "set-constant" }], requestLog, updatedAt: now }, matrixOverrides: [{ action: "block", scope: "example.com", target: "*", party: "thirdParty", resourceType: "script", temporary: false }], now });
  assert.deepEqual(result.issues.map((item) => item.type), ["video-never-playable", "repeated-player-errors", "continuous-navigation-loop", "large-exception-burst", "failed-spa-navigation"]);
  assert.deepEqual(new Set(result.recentActions.map((item) => item.type)), new Set(["network", "cosmetic", "scriptlet", "matrix"]));
  assert.equal(result.automaticChangesApplied, false);
});

test("does not report stale or sub-threshold observations", () => {
  const result = analyzeBreakage({ state: { breakageSignals: [{ type: "media-error", timestamp: 1 }], requestLog: [], protectionActions: [] }, now: 100_000 });
  assert.equal(result.status, "no-breakage-signal");
  assert.deepEqual(result.issues, []);
});
