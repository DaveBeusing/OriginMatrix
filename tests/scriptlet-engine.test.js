import test from "node:test";
import assert from "node:assert/strict";
import { createScriptletFilter } from "../src/filters/filter-model.js";
import { ScriptletEngine } from "../src/scriptlets/scriptlet-engine.js";
import { SCRIPTLET_PHASE, ScriptletRegistry } from "../src/scriptlets/scriptlet-registry.js";
import { readFile } from "node:fs/promises";

test("registry exposes only bundled scriptlet identifiers", () => {
  const registry = new ScriptletRegistry();
  assert.deepEqual(registry.list(), ["abort-on-property-read", "remove-node-text", "set-constant"]);
  assert.equal(registry.getPhase("set-constant"), SCRIPTLET_PHASE.EARLY);
  assert.equal(registry.getPhase("abort-on-property-read"), SCRIPTLET_PHASE.EARLY);
  assert.equal(registry.getPhase("remove-node-text"), SCRIPTLET_PHASE.NORMAL);
  assert.throws(() => registry.createInvocation("remote-code", ["alert(1)"]), /Unknown scriptlet/);
  assert.throws(() => registry.createInvocation("set-constant", ["window.value", "alert(1)"]), /Invalid arguments/);
  assert.throws(() => registry.createInvocation("set-constant", ["__proto__.value", "true"]), /Invalid arguments/);
});

test("prepares deterministic early and normal phases without duplicate invocations", async () => {
  const calls = [];
  const engine = new ScriptletEngine({ api: { async executeScript(details) { calls.push(details); return []; } } });
  const early = createScriptletFilter({ domains: ["example.com"], name: "set-constant", args: ["player.ads", "undefined"] });
  const normal = createScriptletFilter({ domains: ["example.com"], name: "remove-node-text", args: [".advert", "Sponsored"] });
  const filters = [normal, early, early];
  const earlyGeneration = engine.prepare(filters, { hostname: "video.example.com", phase: SCRIPTLET_PHASE.EARLY });
  const normalGeneration = engine.prepare(filters, { hostname: "video.example.com", phase: SCRIPTLET_PHASE.NORMAL });
  assert.equal(earlyGeneration.phase, "early");
  assert.deepEqual(earlyGeneration.invocations.map(({ name }) => name), ["set-constant"]);
  assert.deepEqual(normalGeneration.invocations.map(({ name }) => name), ["remove-node-text"]);
  await engine.execute(earlyGeneration, { tabId: 4 });
  await engine.execute(normalGeneration, { tabId: 4 });
  assert.deepEqual(calls.map(({ func }) => func.name), ["setConstant", "removeNodeText"]);
  assert.ok(calls.every(({ world }) => world === "MAIN"));
  assert.throws(() => engine.prepare(filters, { hostname: "example.com", phase: "late" }), /Invalid scriptlet execution phase/);
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

test("activates only registry-supported filter-list scriptlets", () => {
  const engine = new ScriptletEngine({ api: { executeScript: async () => [] } });
  const generation = engine.prepareGeneration([
    createScriptletFilter({ domains: ["example.com"], name: "set-constant", args: ["player.ads", "undefined"] }),
    createScriptletFilter({ domains: ["example.com"], name: "unknown-scriptlet", args: [] }),
  ]);
  assert.equal(generation.filters.length, 1);
  assert.equal(generation.unsupported.length, 1);
  assert.deepEqual(engine.activate(generation), { scriptletRules: 1, scriptletUnsupported: 1 });
  assert.equal(engine.prepareForHostname("video.example.com").invocations.length, 1);
  assert.deepEqual(engine.getDiagnostics(), { bundledScriptlets: 3, scriptletRules: 1, scriptletUnsupported: 1 });
  engine.clear();
  assert.equal(engine.prepareForHostname("example.com").invocations.length, 0);
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
  assert.ok(manifest.permissions.includes("declarativeNetRequestFeedback"));
});
