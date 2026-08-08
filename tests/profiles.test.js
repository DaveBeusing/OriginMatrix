import test from "node:test";
import assert from "node:assert/strict";
import { policiesForProfile } from "../src/engine/profiles.js";

test("balanced blocks active third-party resource types and allows first party", () => {
  const policies = policiesForProfile("balanced");
  assert.equal(policies.some((policy) => policy.party === "firstParty" && policy.action === "allow"), true);
  assert.deepEqual(policies.filter((policy) => policy.action === "block").map((policy) => policy.resourceType), ["script", "sub_frame", "xmlhttprequest", "websocket"]);
});

test("strict blocks all third-party requests", () => {
  const policies = policiesForProfile("strict");
  assert.equal(policies.find((policy) => policy.party === "thirdParty").resourceType, "all");
});

test("custom clears global profile defaults", () => {
  assert.deepEqual(policiesForProfile("custom"), []);
});
