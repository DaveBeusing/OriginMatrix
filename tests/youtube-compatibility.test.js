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
  assert.equal(result.supportedScriptlet, 1);
  assert.equal(result.unsupportedNetwork, 1);
  assert.equal(result.unsupportedCosmetic, 1);
  assert.equal(result.unsupportedScriptlet, 0);
  assert.equal(result.supportedRules, 4);
  assert.equal(result.unsupportedRules, 2);
  assert.equal(result.supportPercent, 66.7);
  assert.equal(result.capabilities.scriptlets, true);
  assert.equal(result.capabilities.runtimePlaybackVerification, false);
  assert.equal(result.samples.length, 2);
});

test("does not infer compatibility when no targeted rules exist", () => {
  const result = analyzeYouTubeCompatibility("! empty\n||ads.example^");
  assert.equal(result.relevantRules, 0);
  assert.equal(result.supportPercent, 0);
  assert.deepEqual(result.samples, []);
});
