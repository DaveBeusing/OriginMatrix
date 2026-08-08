import test from "node:test";
import assert from "node:assert/strict";
import { buildMatrixModel, classifyParty } from "../src/engine/matrix-projector.js";
import { PolicyResolver } from "../src/engine/policy-resolver.js";
import { createPolicy } from "../src/shared/models.js";

test("projects observed domains into the five Phase-4 resource columns", () => {
  const policies = [
    createPolicy({ resourceType: "script", party: "thirdParty", action: "block" }),
    createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "allow", temporary: true, tabId: 7 }),
  ];
  const model = buildMatrixModel({
    tabId: 7,
    topDomain: "example.com",
    domains: { "cdn.test": { total: 5, types: { script: 2 } }, "example.com": { total: 8, types: {} } },
    policies,
    resolver: new PolicyResolver(),
  });
  assert.deepEqual(model.resourceTypes, ["script", "xmlhttprequest", "sub_frame", "image", "media"]);
  assert.equal(model.rows[0].target, "example.com");
  const scriptCell = model.rows[1].cells.script;
  assert.equal(scriptCell.explicitAction, "allow");
  assert.equal(scriptCell.editAction, "allow");
  assert.equal(scriptCell.effectiveAction, "allow");
  assert.equal(scriptCell.source, "temporary");
});

test("persistent policies remain visible but temporary editing starts at inherit", () => {
  const policy = createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "image", action: "block" });
  const model = buildMatrixModel({
    tabId: 7,
    topDomain: "example.com",
    domains: { "cdn.test": { total: 1, types: { image: 1 } } },
    policies: [policy],
    resolver: new PolicyResolver(),
  });
  assert.equal(model.rows[0].cells.image.explicitAction, "block");
  assert.equal(model.rows[0].cells.image.editAction, "inherit");
  assert.equal(model.rows[0].cells.image.source, "persistent");
});

test("classifies parent and child hostnames as first-party", () => {
  assert.equal(classifyParty("example.com", "cdn.example.com"), "firstParty");
  assert.equal(classifyParty("example.com", "example.net"), "thirdParty");
});
