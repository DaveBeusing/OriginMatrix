import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DEFAULT_FILTER_LISTS, EASYPRIVACY } from "../src/filters/filter-list-catalog.js";
import { UnifiedFilterListManager } from "../src/filters/unified-filter-list-manager.js";
import { NetworkFilterCompiler } from "../src/filters/network-filter-compiler.js";
import { CosmeticEngine } from "../src/cosmetic/cosmetic-engine.js";
import { ScriptletEngine } from "../src/scriptlets/scriptlet-engine.js";

test("activates EasyList and EasyPrivacy through one deduplicated generation", async () => {
  let installed = [];
  const networkEngine = {
    budget: undefined,
    async getDynamicRules() { return installed; },
    async replaceFilterRules(rules) { installed = rules; },
  };
  const manager = new UnifiedFilterListManager({
    lists: DEFAULT_FILTER_LISTS,
    networkEngine,
    compiler: new NetworkFilterCompiler(),
    cosmeticEngine: new CosmeticEngine(),
    scriptletEngine: new ScriptletEngine({ api: { executeScript: async () => [] } }),
    loadText: (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8"),
    settingsStore: { async getAll() { return {}; }, async setEnabled() {} },
  });
  const statuses = await manager.initialize();
  assert.deepEqual(statuses.map(({ id, enabled, state }) => ({ id, enabled, state })), [
    { id: "easylist", enabled: true, state: "active" },
    { id: "easyprivacy", enabled: true, state: "active" },
  ]);
  assert.ok(installed.length > 10_000);
  assert.equal(new Set(installed.map(({ id }) => id)).size, installed.length);
  await manager.setEnabled("easyprivacy", false);
  assert.equal(manager.getStatuses()[1].state, "disabled");
  assert.ok(installed.length < 10_000);
});

test("bundled EasyPrivacy snapshot matches pinned metadata", async () => {
  const bytes = await readFile(new URL(`../${EASYPRIVACY.path}`, import.meta.url));
  const text = bytes.toString("utf8");
  assert.match(text, new RegExp(`^\\[Adblock Plus 1\\.1\\]\\r?\\n! Version: ${EASYPRIVACY.snapshotVersion}`, "m"));
  assert.match(text, new RegExp(`! Commit: ${EASYPRIVACY.snapshotCommit}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EASYPRIVACY.sha256);
});

test("activates My Filters through the shared network and cosmetic generation", async () => {
  let installed = [];
  const cosmeticEngine = new CosmeticEngine();
  const manager = new UnifiedFilterListManager({
    lists: [{ id: "base", title: "Base", enabled: true, path: "base.txt", snapshotVersion: "1" }],
    networkEngine: { async getDynamicRules() { return installed; }, async replaceFilterRules(rules) { installed = rules; } },
    compiler: new NetworkFilterCompiler(), cosmeticEngine,
    scriptletEngine: new ScriptletEngine({ api: { executeScript: async () => [] } }),
    loadText: async () => "[Adblock Plus 2.0]", settingsStore: { async getAll() { return {}; }, async setEnabled() {} },
  });
  manager.configureCustomSource("||custom-ads.example^\nexample.com##.picked-ad");
  await manager.initialize();
  assert.equal(installed.length, 1);
  assert.deepEqual(cosmeticEngine.getSelectors("example.com"), [".picked-ad"]);
  const attribution = manager.getSourceState("base").generation.networkAttributions[installed[0].id];
  assert.deepEqual(attribution, [{ source: "My Filters", rule: "||custom-ads.example^" }]);
});
