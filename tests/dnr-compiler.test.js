import test from "node:test";
import assert from "node:assert/strict";
import { DnrCompiler } from "../src/engine/dnr-compiler.js";
import { createThirdPartyScriptPolicy } from "../src/shared/models.js";

test("compiles a tab-scoped third-party script block", () => {
  const policy = createThirdPartyScriptPolicy({ site: "example.com", tabId: 42 });
  const rule = new DnrCompiler().compileSessionPolicy(policy);

  assert.deepEqual(rule, {
    id: 900042,
    priority: 900,
    action: { type: "block" },
    condition: {
      initiatorDomains: ["example.com"],
      domainType: "thirdParty",
      resourceTypes: ["script"],
      tabIds: [42],
    },
  });
});

test("rejects unsupported policy actions", () => {
  const policy = { ...createThirdPartyScriptPolicy({ site: "example.com", tabId: 7 }), action: "allow" };
  assert.throws(() => new DnrCompiler().compileSessionPolicy(policy), /only supports block/);
});
