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
