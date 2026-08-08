import test from "node:test";
import assert from "node:assert/strict";
import { analyzeYouTubeCompatibility } from "../src/diagnostics/youtube-compatibility.js";

test("classifies supported and unsupported YouTube-related filter rules", () => {
  const result = analyzeYouTubeCompatibility(`
||youtube.com^
@@||googlevideo.com^
youtube.com##.promoted
youtube.com##+js(set-constant, playerResponse.adPlacements, undefined)
||youtube.com^$redirect=noopjs
youtube.com#@#.allowed
||unrelated.example^
`, { listVersion: "fixture" });
  assert.equal(result.listVersion, "fixture");
  assert.equal(result.relevantRules, 6);
  assert.equal(result.supportedNetwork, 1);
  assert.equal(result.supportedExceptions, 1);
  assert.equal(result.supportedCosmetic, 1);
  assert.equal(result.unsupportedNetwork, 1);
  assert.equal(result.unsupportedCosmetic, 1);
  assert.equal(result.unsupportedScriptlet, 1);
  assert.equal(result.supportedRules, 3);
  assert.equal(result.unsupportedRules, 3);
  assert.equal(result.supportPercent, 50);
  assert.equal(result.capabilities.runtimePlaybackVerification, false);
  assert.equal(result.samples.length, 3);
});

test("does not infer compatibility when no targeted rules exist", () => {
  const result = analyzeYouTubeCompatibility("! empty\n||ads.example^");
  assert.equal(result.relevantRules, 0);
  assert.equal(result.supportPercent, 0);
  assert.deepEqual(result.samples, []);
});
