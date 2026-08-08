import test from "node:test";
import assert from "node:assert/strict";
import { CosmeticEngine } from "../src/cosmetic/cosmetic-engine.js";
import { CosmeticParser } from "../src/cosmetic/cosmetic-parser.js";
import { SelectorStore } from "../src/cosmetic/selector-store.js";
import { createCosmeticFilter, createNetworkFilter } from "../src/filters/filter-model.js";
import { readFile } from "node:fs/promises";

test("accepts native relational CSS and rejects procedural or unsafe syntax", () => {
  const parser = new CosmeticParser();
  const result = parser.parseModels([
    createCosmeticFilter({ domains: ["example.com"], selector: ".advertisement > img" }),
    createCosmeticFilter({ domains: ["example.com"], selector: "div:has(.sponsor)" }),
    createCosmeticFilter({ domains: ["example.com"], selector: "div:has-text(sponsor)" }),
    createCosmeticFilter({ domains: ["example.com"], selector: ".ad { color: red" }),
    createNetworkFilter({ pattern: "||ads.example^" }),
  ]);
  assert.equal(result.filters.length, 2);
  assert.deepEqual(result.unsupported.map(({ reason }) => reason), ["procedural-selector-not-supported", "unsafe-selector-syntax"]);
});

test("selects only matching site filters and honors exclusions", () => {
  const store = new SelectorStore();
  store.replace([
    createCosmeticFilter({ domains: ["example.com"], excludedDomains: ["shop.example.com"], selector: ".ad" }),
    createCosmeticFilter({ domains: ["news.example.com"], selector: "#sponsor" }),
    createCosmeticFilter({ domains: ["other.test"], selector: ".other" }),
    createCosmeticFilter({ domains: ["news.example.com"], selector: ".ad", exception: true }),
  ]);
  assert.deepEqual(store.getForHostname("NEWS.Example.com"), ["#sponsor"]);
  assert.deepEqual(store.getForHostname("shop.example.com"), []);
  assert.deepEqual(store.getForHostname("unrelated.test"), []);
});

test("prepares and atomically activates a cosmetic generation", () => {
  const engine = new CosmeticEngine();
  const generation = engine.prepare([createCosmeticFilter({ domains: ["example.com"], selector: ".ad" })]);
  assert.deepEqual(engine.getSelectors("example.com"), []);
  assert.deepEqual(engine.activate(generation), { cosmeticRules: 1, cosmeticUnsupported: 0, indexedDomains: 1 });
  assert.deepEqual(engine.getSelectors("www.example.com"), [".ad"]);
});

test("caps selectors delivered to one document", () => {
  const store = new SelectorStore();
  store.replace(Array.from({ length: 5_001 }, (_, index) => (
    createCosmeticFilter({ domains: ["example.com"], selector: `.ad-${index}` })
  )));
  assert.equal(store.getForHostname("example.com").length, 5_000);
});

test("manifest loads the cosmetic injector before its content-script bootstrap", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/cosmetic/cosmetic-injector.js", "src/cosmetic/dynamic-cosmetic-filter.js", "src/cosmetic/content-script.js",
  ]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].all_frames, true);
});
