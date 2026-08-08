import test from "node:test";
import assert from "node:assert/strict";
import { AutomaticFilterResolver } from "../src/filters/automatic-filter-resolver.js";
import { createExceptionFilter, createNetworkFilter } from "../src/filters/filter-model.js";

test("resolves indexed host blocks by site, resource, and party", () => {
  const resolver = new AutomaticFilterResolver();
  const generation = resolver.prepare([
    createNetworkFilter({ pattern: "||ads.example^", domains: ["news.test"], resourceTypes: ["script"], thirdParty: true }),
    createNetworkFilter({ pattern: "*/sponsor/*" }),
  ], { source: "EasyList" });
  assert.deepEqual(resolver.activate(generation), { automaticFiltersIndexed: 1 });
  assert.deepEqual(resolver.resolve({ topDomain: "news.test", targetDomain: "cdn.ads.example", resourceType: "script", party: "thirdParty" }), {
    action: "block", source: "EasyList", matchedFilters: 1,
  });
  assert.equal(resolver.resolve({ topDomain: "other.test", targetDomain: "ads.example", resourceType: "script", party: "thirdParty" }).action, "inherit");
  assert.equal(resolver.resolve({ topDomain: "news.test", targetDomain: "ads.example", resourceType: "image", party: "thirdParty" }).action, "inherit");
});

test("automatic exceptions override matching blocks without overriding Matrix policy", () => {
  const resolver = new AutomaticFilterResolver();
  resolver.activate(resolver.prepare([
    createNetworkFilter({ pattern: "||ads.example^" }),
    createExceptionFilter({ pattern: "||ads.example^", domains: ["trusted.test"] }),
  ], { source: "EasyList" }));
  assert.equal(resolver.resolve({ topDomain: "trusted.test", targetDomain: "ads.example", resourceType: "image", party: "thirdParty" }).action, "allow");
  resolver.clear();
  assert.equal(resolver.resolve({ topDomain: "trusted.test", targetDomain: "ads.example", resourceType: "image", party: "thirdParty" }).action, "inherit");
});

test("ALL exposes only resource-agnostic automatic decisions and COOKIE stays Matrix-only", () => {
  const resolver = new AutomaticFilterResolver();
  resolver.activate(resolver.prepare([
    createNetworkFilter({ pattern: "||all.example^" }),
    createNetworkFilter({ pattern: "||scripts.example^", resourceTypes: ["script"] }),
  ], { source: "EasyList" }));
  assert.equal(resolver.resolve({ topDomain: "site.test", targetDomain: "all.example", resourceType: "all", party: "thirdParty" }).action, "block");
  assert.equal(resolver.resolve({ topDomain: "site.test", targetDomain: "scripts.example", resourceType: "all", party: "thirdParty" }).action, "inherit");
  assert.equal(resolver.resolve({ topDomain: "site.test", targetDomain: "all.example", resourceType: "cookie", party: "thirdParty" }).action, "inherit");
});
