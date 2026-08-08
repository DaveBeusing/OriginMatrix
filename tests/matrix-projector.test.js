import test from "node:test";
import assert from "node:assert/strict";
import { buildMatrixModel, classifyParty } from "../src/engine/matrix-projector.js";
import { PolicyResolver } from "../src/engine/policy-resolver.js";
import { createPolicy } from "../src/shared/models.js";

test("projects aggregate rows and observed domains into all Phase-6 columns", () => {
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
  assert.deepEqual(model.resourceTypes, ["all", "cookie", "stylesheet", "image", "media", "script", "xmlhttprequest", "sub_frame", "font", "websocket", "other"]);
  assert.deepEqual(model.rows.slice(0, 4).map((row) => row.label), ["GLOBAL", "*", "1st-party", "3rd-party"]);
  const domainRows = model.rows.filter((row) => row.kind === "domain");
  assert.equal(domainRows[0].target, "example.com");
  const scriptCell = domainRows[1].cells.script;
  assert.equal(scriptCell.explicitAction, "allow");
  assert.equal(scriptCell.editAction, "allow");
  assert.equal(scriptCell.effectiveAction, "allow");
  assert.equal(scriptCell.source, "temporary");
});

test("persistent policies remain visible and provide the edit-cycle baseline", () => {
  const policy = createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "image", action: "block" });
  const model = buildMatrixModel({
    tabId: 7,
    topDomain: "example.com",
    domains: { "cdn.test": { total: 1, types: { image: 1 } } },
    policies: [policy],
    resolver: new PolicyResolver(),
  });
  const domainRow = model.rows.find((row) => row.kind === "domain");
  assert.equal(domainRow.cells.image.explicitAction, "block");
  assert.equal(domainRow.cells.image.editAction, "block");
  assert.equal(domainRow.cells.image.source, "persistent");
});

test("keeps target-specific policies out of aggregate row projections", () => {
  const policy = createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "block" });
  const model = buildMatrixModel({
    tabId: 7, topDomain: "example.com", domains: { "cdn.test": { total: 1, types: {} } }, policies: [policy], resolver: new PolicyResolver(),
  });
  assert.equal(model.rows.find((row) => row.kind === "site").cells.script.effectiveAction, "inherit");
  assert.equal(model.rows.find((row) => row.kind === "domain").cells.script.effectiveAction, "block");
});

test("shows global defaults as inherited in site and domain rows", () => {
  const policy = createPolicy({ resourceType: "script", action: "block" });
  const model = buildMatrixModel({
    tabId: 7, topDomain: "example.com", domains: { "cdn.test": { total: 1, types: {} } }, policies: [policy], resolver: new PolicyResolver(),
  });
  assert.equal(model.rows.find((row) => row.kind === "global").cells.script.explicitAction, "block");
  assert.equal(model.rows.find((row) => row.kind === "site").cells.script.effectiveAction, "block");
  assert.equal(model.rows.find((row) => row.kind === "domain").cells.script.effectiveAction, "block");
});

test("renders an inherit edit marker while resolving to the parent policy", () => {
  const parent = createPolicy({ resourceType: "script", action: "block" });
  const marker = createPolicy({ scope: "example.com", target: "cdn.test", resourceType: "script", action: "inherit", temporary: true, tabId: 7 });
  const model = buildMatrixModel({
    tabId: 7,
    topDomain: "example.com",
    domains: { "cdn.test": { total: 1, types: {} } },
    policies: [parent, marker],
    temporaryPolicies: [marker],
    resolver: new PolicyResolver(),
  });
  const cell = model.rows.find((row) => row.kind === "domain").cells.script;
  assert.equal(cell.explicitAction, "inherit");
  assert.equal(cell.editAction, "inherit");
  assert.equal(cell.effectiveAction, "block");
  assert.equal(cell.source, "temporary");
});

test("classifies parent and child hostnames as first-party", () => {
  assert.equal(classifyParty("example.com", "cdn.example.com"), "firstParty");
  assert.equal(classifyParty("example.com", "example.net"), "thirdParty");
});

test("uses automatic filtering as the default and Matrix rules as explicit overrides", () => {
  const automaticResolver = {
    resolve: ({ targetDomain, resourceType }) => targetDomain === "ads.test" && resourceType === "script"
      ? { action: "block", source: "EasyList" }
      : { action: "inherit", source: null },
  };
  const automatic = buildMatrixModel({
    tabId: 7, topDomain: "example.com", domains: { "ads.test": { total: 1, types: { script: 1 } } },
    policies: [], resolver: new PolicyResolver(), automaticResolver,
  }).rows.find((row) => row.kind === "domain").cells.script;
  assert.equal(automatic.automaticAction, "block");
  assert.equal(automatic.effectiveAction, "block");
  assert.equal(automatic.effectiveSource, "automatic");
  assert.equal(automatic.automaticSource, "EasyList");

  const userAllow = createPolicy({ scope: "example.com", target: "ads.test", resourceType: "script", action: "allow" });
  const overridden = buildMatrixModel({
    tabId: 7, topDomain: "example.com", domains: { "ads.test": { total: 1, types: { script: 1 } } },
    policies: [userAllow], resolver: new PolicyResolver(), automaticResolver,
  }).rows.find((row) => row.kind === "domain").cells.script;
  assert.equal(overridden.automaticAction, "block");
  assert.equal(overridden.effectiveAction, "allow");
  assert.equal(overridden.effectiveSource, "matrix");
});
