import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { DnrCompiler } from "../src/engine/dnr-compiler.js";
import { createPolicy } from "../src/shared/models.js";
import { DEFAULT_FILTER_LISTS } from "../src/filters/filter-list-catalog.js";
import { FILTER_COMPILER_SCHEMA_VERSION } from "../src/storage/prepared-generation-cache-store.js";

const root = new URL("../", import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, root), "utf8"));
}

test("manifest loads the bundled base network ruleset by default", async () => {
  const manifest = await readJson("manifest.json");
  const resource = manifest.declarative_net_request.rule_resources.find(({ id }) => id === "base-network");
  assert.deepEqual(resource, { id: "base-network", enabled: true, path: "rules/base-network.json" });
  const rules = await readJson(resource.path);
  assert.ok(rules.length > 0);
});

test("bundled rules are deterministic low-priority subresource blocks", async () => {
  const rules = await readJson("rules/base-network.json");
  assert.equal(new Set(rules.map(({ id }) => id)).size, rules.length);
  for (const rule of rules) {
    assert.equal(rule.priority, 10);
    assert.deepEqual(rule.action, { type: "block" });
    assert.ok(!rule.condition.resourceTypes.includes("main_frame"));
  }
});

test("Matrix allows override bundled blocks while session rules stay isolated", async () => {
  const staticRules = await readJson("rules/base-network.json");
  const allow = createPolicy({
    scope: "example.com", target: "doubleclick.net", resourceType: "script", action: "allow",
  });
  const [dynamicAllow] = new DnrCompiler().compilePolicies([allow]);
  assert.equal(dynamicAllow.action.type, "allow");
  assert.ok(dynamicAllow.priority > Math.max(...staticRules.map(({ priority }) => priority)));

  const sessionBlock = createPolicy({
    scope: "example.com", target: "doubleclick.net", resourceType: "script", action: "block",
    temporary: true, tabId: 42,
  });
  const [sessionRule] = new DnrCompiler().compilePolicies([sessionBlock], { temporary: true });
  assert.deepEqual(sessionRule.condition.tabIds, [42]);
  assert.ok(sessionRule.id >= 900000);
  assert.ok(sessionRule.priority > 10);
});

test("generated core rulesets match deterministic metadata and manifest references", async () => {
  const manifest = await readJson("manifest.json");
  const metadata = await readJson("rules/generated/metadata.json");
  assert.equal(metadata.compilerVersion, FILTER_COMPILER_SCHEMA_VERSION);
  assert.ok(metadata.totalRuleCount > 10_000 && metadata.totalRuleCount <= 300_000);
  assert.equal(metadata.rulesets.length, 5);
  let total = 0;
  for (const entry of metadata.rulesets) {
    const list = DEFAULT_FILTER_LISTS.find(({ id }) => id === entry.listId);
    const resource = manifest.declarative_net_request.rule_resources.find(({ id }) => id === entry.id);
    assert.equal(entry.sourceChecksum, list.sha256);
    assert.equal(resource.path, entry.path);
    assert.equal(resource.enabled, list.enabled);
    const serialized = await readFile(new URL(`../${entry.path}`, import.meta.url), "utf8");
    assert.equal(createHash("sha256").update(serialized).digest("hex"), entry.outputChecksum);
    const rules = JSON.parse(serialized);
    assert.equal(rules.length, entry.generatedRuleCount);
    assert.equal(new Set(rules.map(({ id }) => id)).size, rules.length);
    total += rules.length;
  }
  assert.equal(total, metadata.totalRuleCount);
});
