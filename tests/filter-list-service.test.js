import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { EASYLIST } from "../src/filters/filter-list-catalog.js";
import { FilterListService } from "../src/filters/filter-list-service.js";

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
    loadText: async () => "! fixture\n||ads.example^\n@@||ads.example^$domain=trusted.example\n||bad.example^$redirect=x",
  });
  const status = await service.activate();
  assert.equal(status.state, "active");
  assert.equal(status.rulesLoaded, 3);
  assert.equal(status.rulesSupported, 2);
  assert.equal(status.rulesUnsupported, 1);
  assert.equal(status.rulesCompiled, 2);
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

test("bundled EasyList snapshot matches its pinned metadata", async () => {
  const bytes = await readFile(new URL(`../${EASYLIST.path}`, import.meta.url));
  const text = bytes.toString("utf8");
  assert.match(text, new RegExp(`^\\[Adblock Plus 2\\.0\\]\\r?\\n! Version: ${EASYLIST.snapshotVersion}`, "m"));
  assert.match(text, new RegExp(`! Commit: ${EASYLIST.snapshotCommit}`));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), EASYLIST.sha256);
});
