import test from "node:test";
import assert from "node:assert/strict";
import { policiesForProfile, profileDefinition } from "../src/engine/profiles.js";

test("balanced enables every automatic engine without overriding Matrix inheritance", () => {
  assert.deepEqual(policiesForProfile("balanced"), []);
  assert.deepEqual(profileDefinition("balanced").features, { network: true, cosmetic: true, scriptlets: true });
});

test("strict blocks active third-party request types", () => {
  const policies = policiesForProfile("strict");
  assert.deepEqual(policies.map((policy) => policy.resourceType), ["script", "sub_frame", "xmlhttprequest"]);
  assert.ok(policies.every((policy) => policy.party === "thirdParty" && policy.action === "block"));
});

test("relaxed keeps automatic blocking but disables scriptlets and Matrix defaults", () => {
  assert.deepEqual(policiesForProfile("relaxed"), []);
  assert.deepEqual(profileDefinition("relaxed").features, { network: true, cosmetic: true, scriptlets: false });
  assert.throws(() => profileDefinition("custom"), /Unknown profile/);
});
