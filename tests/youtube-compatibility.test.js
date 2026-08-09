import test from "node:test";
import assert from "node:assert/strict";
import { analyzeYouTubeCompatibility } from "../src/diagnostics/youtube-compatibility.js";
import { readFile } from "node:fs/promises";

test("classifies supported and unsupported YouTube-related filter rules", () => {
  const result = analyzeYouTubeCompatibility(`
||youtube.com^
@@||googlevideo.com^
youtube.com##.promoted
youtube.com##+js(set-constant, playerResponse.adPlacements, undefined)
||youtube.com^$redirect=noopjs
youtube.com#@#.allowed
@@||www.youtube.com^$generichide
||unrelated.example^
`, { listVersion: "fixture" });
  assert.equal(result.listVersion, "fixture");
  assert.equal(result.relevantRules, 7);
  assert.equal(result.supportedNetwork, 1);
  assert.equal(result.supportedExceptions, 1);
  assert.equal(result.supportedCosmetic, 3);
  assert.equal(result.supportedScriptlet, 1);
  assert.equal(result.unsupportedNetwork, 1);
  assert.equal(result.unsupportedCosmetic, 0);
  assert.equal(result.unsupportedScriptlet, 0);
  assert.equal(result.supportedRules, 6);
  assert.equal(result.unsupportedRules, 1);
  assert.equal(result.supportPercent, 85.7);
  assert.equal(result.capabilities.scriptlets, true);
  assert.equal(result.capabilities.runtimePlaybackVerification, false);
  assert.equal(result.samples.length, 1);
});

test("does not infer compatibility when no targeted rules exist", () => {
  const result = analyzeYouTubeCompatibility("! empty\n||ads.example^");
  assert.equal(result.relevantRules, 0);
  assert.equal(result.supportPercent, 0);
  assert.deepEqual(result.samples, []);
});

test("tracks the pinned EasyList YouTube coverage improved by generic cosmetic support", async () => {
  const source = await readFile(new URL("../filters/easylist.txt", import.meta.url), "utf8");
  const result = analyzeYouTubeCompatibility(source);
  assert.equal(result.relevantRules, 42);
  assert.equal(result.supportedNetwork, 8);
  assert.equal(result.supportedExceptions, 6);
  assert.equal(result.supportedCosmetic, 27);
  assert.equal(result.unsupportedCosmetic, 0);
  assert.equal(result.unsupportedNetwork, 1);
  assert.equal(result.supportPercent, 97.6);
  assert.deepEqual(result.unsupportedReasons, { "unsupported-option": 1 });
});

test("tracks the combined default-list YouTube coverage", async () => {
  const sources = await Promise.all(["easylist.txt", "easyprivacy.txt"].map((name) => readFile(new URL(`../filters/${name}`, import.meta.url), "utf8")));
  const result = analyzeYouTubeCompatibility(sources.join("\n"));
  assert.equal(result.relevantRules, 54);
  assert.equal(result.supportedRules, 53);
  assert.equal(result.unsupportedRules, 1);
  assert.equal(result.supportPercent, 98.1);
  assert.equal(result.capabilities.genericHideExceptions, true);
});
