import test from "node:test";
import assert from "node:assert/strict";
import { DnrCompiler } from "../src/engine/dnr-compiler.js";
import { createPolicy, createThirdPartyScriptPolicy } from "../src/shared/models.js";

test("compiles a tab-scoped third-party script block", () => {
  const rule = new DnrCompiler().compileSessionPolicy(createThirdPartyScriptPolicy({ site: "example.com", tabId: 42 }));
  assert.equal(Math.floor(rule.priority / 1_000_000), 1700);
  assert.deepEqual(rule.action, { type: "block" });
  assert.deepEqual(rule.condition, {
    initiatorDomains: ["example.com"], domainType: "thirdParty", resourceTypes: ["script"], tabIds: [42],
  });
  assert.ok(rule.id >= 900000 && rule.id < 1000000);
});

test("compiles persistent allow rules without tabIds", () => {
  const policy = createPolicy({ scope: "example.com", target: "cdn.com", resourceType: "script", action: "allow" });
  const [rule] = new DnrCompiler().compilePolicies([policy]);
  assert.equal(Math.floor(rule.priority / 1_000_000), 800);
  assert.deepEqual(rule.action, { type: "allow" });
  assert.deepEqual(rule.condition, {
    initiatorDomains: ["example.com"], requestDomains: ["cdn.com"], resourceTypes: ["script"],
  });
  assert.ok(rule.id >= 100000 && rule.id < 500000);
});

test("does not compile inherit policies", () => {
  const policy = createPolicy({ resourceType: "script", action: "inherit" });
  assert.throws(() => new DnrCompiler().compilePolicies([policy]), /Unsupported policy action/);
});

test("compiles cookie blocks into request and response header rules", () => {
  const policy = createPolicy({ scope: "example.com", target: "tracker.test", resourceType: "cookie", action: "block" });
  const result = new DnrCompiler().compilePolicySet([policy]);
  assert.equal(result.rules.length, 2);
  assert.deepEqual(result.rules[0].action.requestHeaders, [{ header: "cookie", operation: "remove" }]);
  assert.deepEqual(result.rules[1].action.responseHeaders, [{ header: "set-cookie", operation: "remove" }]);
  assert.equal(result.ruleIds.get(policy.id).length, 2);
});

test("rejects unsafe cookie allow policies", () => {
  const policy = createPolicy({ resourceType: "cookie", action: "allow" });
  assert.throws(() => new DnrCompiler().compilePolicies([policy]), /cannot be represented safely/);
});

test("expands OTHER into supported DNR resource types", () => {
  const policy = createPolicy({ resourceType: "other", action: "block" });
  const [rule] = new DnrCompiler().compilePolicies([policy]);
  assert.deepEqual(rule.condition.resourceTypes, ["other", "object", "csp_report"]);
});
