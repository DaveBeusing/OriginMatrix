import test from "node:test";
import assert from "node:assert/strict";
import { CosmeticEngine } from "../src/cosmetic/cosmetic-engine.js";
import { CosmeticParser } from "../src/cosmetic/cosmetic-parser.js";
import { SelectorStore } from "../src/cosmetic/selector-store.js";
import { createCosmeticControlFilter, createCosmeticFilter, createNetworkFilter } from "../src/filters/filter-model.js";
import { parseFilterText } from "../src/filters/filter-parser.js";
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
  assert.equal(result.proceduralFilters.length, 1);
  assert.deepEqual(result.unsupported.map(({ reason }) => reason), ["unsafe-selector-syntax"]);
});

test("compiles bounded literal, regexp, and nested has-text plans", () => {
  const parser = new CosmeticParser();
  const result = parser.parseModels([
    createCosmeticFilter({ domains: ["example.com"], selector: ".card:has-text(Sponsored)" }),
    createCosmeticFilter({ domains: ["example.com"], selector: ".card:has(.label:has-text(/^(?:AD|Anzeige)$/i))" }),
    createCosmeticFilter({ domains: ["example.com"], selector: ".card:style(display:none)" }),
    createCosmeticFilter({ domains: ["example.com"], selector: ".card:has-text(/(a+)+$/)" }),
  ]);
  assert.deepEqual(result.proceduralFilters.map(({ plan }) => plan), [
    { targetSelector: ".card", descendantSelector: null, matcher: { type: "text", value: "Sponsored" } },
    { targetSelector: ".card", descendantSelector: ".label", matcher: { type: "regexp", value: "^(?:AD|Anzeige)$", flags: "i" } },
  ]);
  assert.deepEqual(result.unsupported.map(({ reason }) => reason), ["procedural-selector-not-supported", "unsafe-procedural-regexp"]);
});

test("scopes procedural plans by hostname and applies exceptions", () => {
  const engine = new CosmeticEngine();
  const generation = engine.prepare([
    createCosmeticFilter({ domains: ["example.com"], selector: ".card:has-text(Sponsored)" }),
    createCosmeticFilter({ domains: ["shop.example.com"], selector: ".card:has-text(Sponsored)", exception: true }),
  ]);
  assert.equal(engine.activate(generation).proceduralCosmeticRules, 2);
  assert.equal(engine.getProceduralFilters("news.example.com").length, 1);
  assert.equal(engine.getProceduralFilters("shop.example.com").length, 0);
  assert.equal(engine.getProceduralFilters("other.test").length, 0);
});

test("generichide exceptions suppress global filters without disabling site rules", () => {
  const engine = new CosmeticEngine();
  engine.activate(engine.prepare([
    createCosmeticFilter({ selector: ".generic-ad" }),
    createCosmeticFilter({ domains: ["youtube.com"], selector: ".site-ad" }),
    createCosmeticFilter({ selector: ".generic-card:has-text(Sponsored)" }),
    createCosmeticControlFilter({ mode: "generichide", domains: ["www.youtube.com"] }),
  ]));
  assert.deepEqual(engine.getSelectors("www.youtube.com"), [".site-ad"]);
  assert.deepEqual(engine.getProceduralFilters("www.youtube.com"), []);
  assert.deepEqual(engine.getSelectors("music.youtube.com"), [".generic-ad", ".site-ad"]);
});

test("selects only matching site filters and honors exclusions", () => {
  const store = new SelectorStore();
  store.replace([
    createCosmeticFilter({ selector: ".global-ad" }),
    createCosmeticFilter({ domains: ["shop.example.com"], selector: ".global-ad", exception: true }),
    createCosmeticFilter({ domains: ["example.com"], excludedDomains: ["shop.example.com"], selector: ".ad" }),
    createCosmeticFilter({ domains: ["news.example.com"], selector: "#sponsor" }),
    createCosmeticFilter({ domains: ["other.test"], selector: ".other" }),
    createCosmeticFilter({ domains: ["news.example.com"], selector: ".ad", exception: true }),
  ]);
  assert.deepEqual(store.getForHostname("NEWS.Example.com"), ["#sponsor", ".global-ad"]);
  assert.deepEqual(store.getForHostname("shop.example.com"), []);
  assert.deepEqual(store.getPlanForHostname("shop.example.com").dynamicSelectors, []);
  assert.deepEqual(store.getForHostname("unrelated.test"), [".global-ad"]);
  assert.deepEqual(store.getPlanForHostname("news.example.com").dynamicSelectors, ["#sponsor"]);
  assert.equal(store.getPlanForHostname("news.example.com"), store.getPlanForHostname("news.example.com"));
});

test("prepares and atomically activates a cosmetic generation", () => {
  const engine = new CosmeticEngine();
  const generation = engine.prepare([createCosmeticFilter({ domains: ["example.com"], selector: ".ad" })]);
  assert.deepEqual(engine.getSelectors("example.com"), []);
  assert.deepEqual(engine.activate(generation), { cosmeticRules: 1, cosmeticUnsupported: 0, globalCosmeticRules: 0, proceduralCosmeticRules: 0, indexedDomains: 1 });
  assert.deepEqual(engine.getSelectors("www.example.com"), [".ad"]);
});

test("caps selectors delivered to one document", () => {
  const store = new SelectorStore();
  store.replace(Array.from({ length: 5_001 }, (_, index) => (
    createCosmeticFilter({ domains: ["example.com"], selector: `.ad-${index}` })
  )));
  assert.equal(store.getForHostname("example.com").length, 5_001);
  assert.equal(store.getPlanForHostname("example.com").dynamicSelectors.length, 5_000);
});

test("invalidates cached effective selector plans on generation replacement", () => {
  const store = new SelectorStore();
  store.replace([createCosmeticFilter({ selector: ".old-ad" })]);
  assert.deepEqual(store.getForHostname("example.com"), [".old-ad"]);
  store.replace([createCosmeticFilter({ selector: ".new-ad" })]);
  assert.deepEqual(store.getForHostname("example.com"), [".new-ad"]);
});

test("indexes the pinned EasyList global cosmetic baseline", async () => {
  const source = await readFile(new URL("../filters/easylist.txt", import.meta.url), "utf8");
  const parsed = parseFilterText(source);
  const engine = new CosmeticEngine();
  const diagnostics = engine.activate(engine.prepare(parsed.filters));
  assert.equal(diagnostics.globalCosmeticRules, 13_640);
});

test("supports the pinned procedural has-text baseline", async () => {
  const sources = await Promise.all(["easylist.txt", "easyprivacy.txt"].map((name) => readFile(new URL(`../filters/${name}`, import.meta.url), "utf8")));
  const parsed = parseFilterText(sources.join("\n"));
  const generation = new CosmeticEngine().prepare(parsed.filters);
  assert.equal(generation.proceduralFilters.length, 244);
  assert.equal(generation.unsupported.filter(({ reason }) => reason === "procedural-selector-not-supported").length, 4);
});

test("manifest loads the cosmetic injector before its content-script bootstrap", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/picker/selector-generator.js", "src/picker/element-picker.js", "src/cosmetic/cosmetic-injector.js", "src/cosmetic/dynamic-cosmetic-filter.js", "src/cosmetic/procedural-cosmetic-filter.js", "src/cosmetic/content-script.js",
  ]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.equal(manifest.content_scripts[0].all_frames, true);
});
