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
