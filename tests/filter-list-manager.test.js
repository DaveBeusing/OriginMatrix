import test from "node:test";
import assert from "node:assert/strict";
import { FilterListManager } from "../src/filters/filter-list-manager.js";

function fakeService({ enabled = true, failWhenEnabled = null } = {}) {
  let active = enabled;
  let activations = 0;
  return {
    list: { id: "easylist", enabled: true },
    setEnabled(value) { active = value; },
    async activate() { activations += 1; if (active === failWhenEnabled) throw new Error("activation failed"); return this.getStatus(); },
    getStatus() { return { id: "easylist", enabled: active, state: active ? "active" : "disabled" }; },
    activations: () => activations,
  };
}

test("initializes services from persistent settings and toggles them", async () => {
  const service = fakeService();
  let stored = false;
  const manager = new FilterListManager({
    services: [service],
    settingsStore: { async getAll() { return { easylist: { enabled: stored } }; }, async setEnabled(_id, enabled) { stored = enabled; } },
  });
  await manager.initialize();
  assert.equal(manager.getStatuses()[0].enabled, false);
  await manager.setEnabled("easylist", true);
  assert.equal(stored, true);
  assert.equal(manager.getStatuses()[0].state, "active");
});

test("restores the previous generation when a toggle fails", async () => {
  const service = fakeService({ enabled: false, failWhenEnabled: true });
  const manager = new FilterListManager({
    services: [service],
    settingsStore: { async getAll() { return { easylist: { enabled: false } }; }, async setEnabled() {} },
  });
  await assert.rejects(() => manager.setEnabled("easylist", true), /activation failed/);
  assert.equal(manager.getStatuses()[0].enabled, false);
  assert.equal(service.activations(), 2);
});

test("persists a staged update only after activation and rolls back on persistence failure", async () => {
  const oldGeneration = { name: "old" };
  const newGeneration = { name: "new" };
  const activations = [];
  let source = "old source";
  let metadata = { version: "old" };
  const service = {
    list: { id: "easylist", enabled: true },
    setEnabled() {}, getStatus() { return { enabled: true }; },
    getSourceState() { return { source, metadata, generation: oldGeneration }; },
    setSource(nextSource, nextMetadata) { source = nextSource; metadata = nextMetadata; },
    async activatePrepared(generation) { activations.push(generation); return { enabled: true, version: generation.name }; },
    async activate() {},
  };
  const updater = {
    async downloadAndPrepare() { return { source: "new source", metadata: { version: "new" }, prepared: newGeneration }; },
    async persist() { throw new Error("storage failed"); },
  };
  const manager = new FilterListManager({ services: [service], settingsStore: { async getAll() { return {}; } }, updater });
  await assert.rejects(() => manager.update("easylist"), /storage failed/);
  assert.deepEqual(activations, [newGeneration, oldGeneration]);
  assert.equal(source, "old source");
  assert.deepEqual(metadata, { version: "old" });
});
