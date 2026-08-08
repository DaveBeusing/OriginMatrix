import test from "node:test";
import assert from "node:assert/strict";
import { PolicyResolver } from "../src/engine/policy-resolver.js";
import { createPolicy } from "../src/shared/models.js";

const resolver = new PolicyResolver();
const policies = [
  createPolicy({ party: "thirdParty", resourceType: "script", action: "block" }),
  createPolicy({ scope: "example.com", resourceType: "script", action: "allow" }),
  createPolicy({ scope: "example.com", target: "analytics.com", resourceType: "script", action: "block" }),
];

function request(topDomain, targetDomain, tabId = 1) {
  return { topDomain, targetDomain, resourceType: "script", party: "thirdParty", tabId };
}

test("site resource rule overrides the global party resource rule", () => {
  assert.equal(resolver.resolve(request("example.com", "cdn.com"), policies).action, "allow");
});

test("site target resource rule is most specific", () => {
  const result = resolver.resolve(request("example.com", "analytics.com"), policies);
  assert.equal(result.action, "block");
  assert.equal(result.policy.target, "analytics.com");
  assert.equal(result.resolutionPath[0].score, 800);
});

test("global third-party script rule applies to other sites", () => {
  assert.equal(resolver.resolve(request("other.com", "cdn.com"), policies).action, "block");
});

test("subdomains match a parent-domain policy", () => {
  assert.equal(resolver.resolve(request("www.example.com", "cdn.analytics.com"), policies).action, "block");
});

test("no match resolves to inherit with diagnostics", () => {
  const result = resolver.resolve({ topDomain: "example.com", targetDomain: "cdn.com", resourceType: "image", party: "thirdParty", tabId: 1 }, []);
  assert.equal(result.action, "inherit");
  assert.equal(result.policy, null);
  assert.match(result.reason, /No matching policy/);
});

test("a temporary tab policy overrides a persistent specific policy only in its tab", () => {
  const temporary = createPolicy({
    scope: "example.com", resourceType: "script", action: "allow", temporary: true, tabId: 9,
  });
  assert.equal(resolver.resolve(request("example.com", "analytics.com", 9), [...policies, temporary]).action, "allow");
  assert.equal(resolver.resolve(request("example.com", "analytics.com", 10), [...policies, temporary]).action, "block");
});

test("a temporary inherit marker masks its persistent cell only in the same tab", () => {
  const persistent = createPolicy({ scope: "example.com", target: "analytics.com", resourceType: "script", action: "block" });
  const marker = createPolicy({ scope: "example.com", target: "analytics.com", resourceType: "script", action: "inherit", temporary: true, tabId: 9 });
  const parent = createPolicy({ resourceType: "script", action: "allow" });
  assert.equal(resolver.resolve(request("example.com", "analytics.com", 9), [parent, persistent, marker]).action, "allow");
  assert.equal(resolver.resolve(request("example.com", "analytics.com", 10), [parent, persistent, marker]).action, "block");
});
