import { PARTY, POLICY_ACTION, RESOURCE_TYPE } from "../shared/models.js";

const SESSION_RULE_ID_BASE = 900_000;

export class DnrCompiler {
  compileSessionPolicy(policy) {
    validatePolicy(policy);

    return {
      id: SESSION_RULE_ID_BASE + policy.tabId,
      priority: 900,
      action: { type: "block" },
      condition: {
        initiatorDomains: [policy.scope],
        domainType: "thirdParty",
        resourceTypes: ["script"],
        tabIds: [policy.tabId],
      },
    };
  }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new TypeError("Policy must be an object.");
  }
  if (policy.temporary !== true) {
    throw new TypeError("Phase 1 compiler only accepts temporary policies.");
  }
  if (policy.action !== POLICY_ACTION.BLOCK) {
    throw new TypeError("Phase 1 compiler only supports block policies.");
  }
  if (policy.party !== PARTY.THIRD_PARTY) {
    throw new TypeError("Phase 1 compiler only supports third-party policies.");
  }
  if (policy.resourceType !== RESOURCE_TYPE.SCRIPT) {
    throw new TypeError("Phase 1 compiler only supports script policies.");
  }
  if (typeof policy.scope !== "string" || policy.scope.length === 0) {
    throw new TypeError("Policy scope must be a non-empty hostname.");
  }
  if (!Number.isInteger(policy.tabId) || policy.tabId < 0) {
    throw new TypeError("Policy tabId must be a non-negative integer.");
  }
}
