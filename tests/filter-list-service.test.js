import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EASYLIST } from "../src/filters/filter-list-catalog.js";
import { FilterListService } from "../src/filters/filter-list-service.js";
import { CosmeticEngine } from "../src/cosmetic/cosmetic-engine.js";
import { ScriptletEngine } from "../src/scriptlets/scriptlet-engine.js";
import { NetworkFilterCompiler } from "../src/filters/network-filter-compiler.js";
import { PreparedGenerationCacheStore } from "../src/storage/prepared-generation-cache-store.js";

function fakeNetworkEngine() {
  let rules = [{ id: 100_001 }];
  return {
    async getDynamicRules() { return structuredClone(rules); },
    async replaceFilterRules(next) { rules = [...rules.filter(({ id }) => id < 500_000 || id > 899_999), ...structuredClone(next)]; },
    rules: () => rules,
  };
}

test("activates a bundled list through parser, compiler, and Network Engine", async () => {
  const networkEngine = fakeNetworkEngine();
  const service = new FilterListService({
    list: { ...EASYLIST, snapshotVersion: "test" },
    networkEngine,
    cosmeticEngine: new CosmeticEngine(),
    scriptletEngine: new ScriptletEngine({ api: { executeScript: async () => [] } }),
    loadText: async () => "! fixture\n||ads.example^\n@@||ads.example^$domain=trusted.example\nexample.com##.advert\nexample.com##+js(set-constant, player.ads, undefined)\n||bad.example^$redirect=x",
  });
  const status = await service.activate();
  assert.equal(status.state, "active");
  assert.equal(status.rulesLoaded, 5);
  assert.equal(status.rulesSupported, 2);
  assert.equal(status.rulesUnsupported, 1);
  assert.equal(status.rulesCompiled, 2);
  assert.equal(status.cosmeticRules, 1);
  assert.equal(status.scriptletRules, 1);
  assert.equal(status.automaticFiltersIndexed, 2);
  assert.deepEqual(service.resolveAutomatic({ topDomain: "site.test", targetDomain: "ads.example", resourceType: "image", party: "thirdParty" }), {
    action: "block", source: "EasyList", matchedFilters: 1,
  });
  assert.ok(networkEngine.rules().some(({ id }) => id === 100_001));
  assert.ok(networkEngine.rules().some(({ id }) => id >= 500_000));
});

test("reports activation errors without replacing the working generation", async () => {
  const networkEngine = fakeNetworkEngine();
  const service = new FilterListService({ list: EASYLIST, networkEngine, loadText: async () => { throw new Error("missing snapshot"); } });
  await assert.rejects(() => service.activate(), /missing snapshot/);
  assert.equal(service.getStatus().state, "error");
  assert.deepEqual(networkEngine.rules(), [{ id: 100_001 }]);
});

test("profile features can disable scriptlets without disabling network or cosmetic protection", async () => {
  const service = new FilterListService({
    list: EASYLIST,
    networkEngine: fakeNetworkEngine(),
    cosmeticEngine: new CosmeticEngine(),
    scriptletEngine: new ScriptletEngine({ api: { executeScript: async () => [] } }),
    loadText: async () => "||ads.example^\nexample.com##.advert\nexample.com##+js(set-constant, player.ads, undefined)",
  });
  service.configure({ network: true, cosmetic: true, scriptlets: false });
  const status = await service.activate();
  assert.equal(status.rulesCompiled, 1);
  assert.equal(status.cosmeticRules, 1);
  assert.equal(status.scriptletRules, 0);
  assert.deepEqual(status.features, { network: true, cosmetic: true, scriptlets: false });
});

test("disabling a list clears every active filter engine generation", async () => {
  const networkEngine = fakeNetworkEngine();
  const cosmeticEngine = new CosmeticEngine();
  const scriptletEngine = new ScriptletEngine({ api: { executeScript: async () => [] } });
  const service = new FilterListService({
    list: EASYLIST, networkEngine, cosmeticEngine, scriptletEngine,
    loadText: async () => "||ads.example^\nexample.com##.advert\nexample.com##+js(set-constant, player.ads, undefined)",
  });
  await service.activate();
  service.setEnabled(false);
  const status = await service.activate();
  assert.equal(status.state, "disabled");
  assert.equal(status.enabled, false);
  assert.equal(status.rulesCompiled, 0);
  assert.equal(cosmeticEngine.getSelectors("example.com").length, 0);
  assert.equal(scriptletEngine.getDiagnostics().scriptletRules, 0);
  assert.equal(networkEngine.rules().some(({ id }) => id >= 500_000), false);
});

test("caches identical prepared generations and reports preparation timings", async () => {
  let clock = 0;
  const service = new FilterListService({
    list: EASYLIST,
    networkEngine: fakeNetworkEngine(),
    loadText: async () => "||ads.example^",
    now: () => { clock += 2; return clock; },
  });
  await service.activate();
  await service.activate();
  assert.deepEqual(service.getPerformanceDiagnostics(), {
    parsingTimeMs: 2,
    compilationTimeMs: 2,
    preparationTimeMs: 10,
    cacheHits: 1,
    signatureCacheHits: 1,
    persistentCacheHit: false,
    persistentCacheMiss: false,
    persistentCacheInvalid: false,
    cacheReadTimeMs: 0,
    cacheWriteTimeMs: 0,
    cachedGenerationSize: 0,
    preparedGenerationCached: true,
  });
});

test("reuses persistent network compilation across service-worker style reconstruction", async () => {
  const data = {};
  const storage = { async get(key) { return { [key]: structuredClone(data[key]) }; }, async set(values) { Object.assign(data, structuredClone(values)); } };
  const store = new PreparedGenerationCacheStore(storage);
  let compilations = 0;
  const compiler = new NetworkFilterCompiler();
  const countedCompiler = { compile(...args) { compilations += 1; return compiler.compile(...args); } };
  const options = { list: EASYLIST, networkEngine: fakeNetworkEngine(), compiler: countedCompiler, preparedGenerationStore: store, loadText: async () => "||ads.example^" };
  const cold = new FilterListService(options);
  await cold.activate();
  assert.equal(cold.getPerformanceDiagnostics().persistentCacheMiss, true);
  const warm = new FilterListService({ ...options, networkEngine: fakeNetworkEngine() });
  await warm.activate();
  assert.equal(compilations, 1);
  assert.equal(warm.getPerformanceDiagnostics().persistentCacheHit, true);
  assert.equal(warm.getPerformanceDiagnostics().compilationTimeMs, 0);
});

test("continues with compilation when persistent cache storage fails", async () => {
  const service = new FilterListService({ list: EASYLIST, networkEngine: fakeNetworkEngine(), preparedGenerationStore: { async get() { return { state: "invalid", size: 0 }; }, async set() { throw new Error("quota"); } }, loadText: async () => "||ads.example^" });
  await service.activate();
  assert.equal(service.getPerformanceDiagnostics().persistentCacheInvalid, true);
  assert.equal(service.getStatus().state, "active");
});

test("bundled EasyList snapshot matches its pinned metadata", async () => {
  const bytes = await readFile(new URL(`../${EASYLIST.path}`, import.meta.url));
  const text = bytes.toString("utf8");
  assert.match(text, new RegExp(`^\\[Adblock Plus 2\\.0\\]\\r?\\n! Version: ${EASYLIST.snapshotVersion}`, "m"));
  assert.match(text, new RegExp(`! Commit: ${EASYLIST.snapshotCommit}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EASYLIST.sha256);
});
