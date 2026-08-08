import test from "node:test";
import assert from "node:assert/strict";
import { createScriptletFilter } from "../src/filters/filter-model.js";
import { ScriptletEngine } from "../src/scriptlets/scriptlet-engine.js";
import { ScriptletRegistry } from "../src/scriptlets/scriptlet-registry.js";
import { readFile } from "node:fs/promises";

test("registry exposes only bundled scriptlet identifiers", () => {
  const registry = new ScriptletRegistry();
  assert.deepEqual(registry.list(), ["abort-on-property-read", "remove-node-text", "set-constant"]);
  assert.throws(() => registry.createInvocation("remote-code", ["alert(1)"]), /Unknown scriptlet/);
  assert.throws(() => registry.createInvocation("set-constant", ["window.value", "alert(1)"]), /Invalid arguments/);
  assert.throws(() => registry.createInvocation("set-constant", ["__proto__.value", "true"]), /Invalid arguments/);
});

test("prepares only matching, valid, deduplicated site scriptlets", () => {
  const engine = new ScriptletEngine({ api: { executeScript: async () => [] } });
  const matching = createScriptletFilter({ domains: ["example.com"], name: "set-constant", args: ["player.ads", "undefined"] });
  const result = engine.prepare([
    matching,
    matching,
    createScriptletFilter({ domains: ["other.test"], name: "set-constant", args: ["player.ads", "undefined"] }),
    createScriptletFilter({ domains: ["example.com"], excludedDomains: ["video.example.com"], name: "abort-on-property-read", args: ["ads.value"] }),
    createScriptletFilter({ domains: ["example.com"], name: "unknown-scriptlet", args: [] }),
  ], { hostname: "video.example.com" });
  assert.equal(result.invocations.length, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.unsupported.length, 1);
});

test("executes only registry-branded bundled functions in the MAIN world", async () => {
  const calls = [];
  const engine = new ScriptletEngine({ api: { async executeScript(details) { calls.push(details); return [{ result: true }]; } } });
  const generation = engine.prepare([
    createScriptletFilter({ domains: ["example.com"], name: "abort-on-property-read", args: ["ads.value"] }),
  ], { hostname: "example.com" });
  const result = await engine.execute(generation, { tabId: 7, frameIds: [0, 2] });
  assert.equal(result.executed, 1);
  assert.deepEqual(calls[0].target, { tabId: 7, frameIds: [0, 2] });
  assert.equal(calls[0].world, "MAIN");
  assert.equal(typeof calls[0].func, "function");
  assert.deepEqual(calls[0].args, ["ads.value"]);
  await assert.rejects(() => engine.execute({ invocations: [{ name: "abort-on-property-read" }] }, { tabId: 7 }), /not created/);
});

test("manifest grants the bundled engine its controlled scripting capability", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.ok(manifest.permissions.includes("scripting"));
});
