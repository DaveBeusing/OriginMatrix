import { PARTY, POLICY_ACTION, RESOURCE_TYPE, WILDCARD, validatePolicy } from "../shared/models.js";
import { specificity } from "./policy-resolver.js";
import { RuleIdManager } from "./rule-id-manager.js";

const PRIORITY_SCALE = 1_000_000;
const OTHER_RESOURCE_TYPES = Object.freeze(["other", "object", "csp_report"]);

export class DnrCompiler {
  constructor(ruleIdManager = new RuleIdManager()) {
    this.ruleIdManager = ruleIdManager;
  }

  compilePolicySet(policies, { temporary = false } = {}) {
    const compilable = policies.map((policy) => validatePolicy(policy, { allowInherit: false }));
    if (compilable.some((policy) => policy.temporary !== temporary)) {
      throw new TypeError(`Expected only ${temporary ? "temporary" : "persistent"} policies.`);
    }
    if (compilable.some((policy) => policy.resourceType === RESOURCE_TYPE.COOKIE && policy.action === POLICY_ACTION.ALLOW)) {
      throw new TypeError("Cookie allow policies cannot be represented safely by DNR.");
    }

    const descriptors = compilable.flatMap((policy) => ruleDescriptors(policy));
    const idInputs = descriptors.map((descriptor) => ({ id: descriptor.key, temporary: descriptor.policy.temporary }));
    const ids = this.ruleIdManager.assign(idInputs);
    const tieOrder = new Map([...compilable]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((policy, index, sorted) => [policy.id, sorted.length - index]));
    if (compilable.length >= PRIORITY_SCALE) throw new RangeError("Too many policies for deterministic priority allocation.");

    const ruleIds = new Map(compilable.map((policy) => [policy.id, []]));
    const rules = descriptors.map((descriptor) => {
      const id = ids.get(descriptor.key);
      ruleIds.get(descriptor.policy.id).push(id);
      return compileRule(descriptor, id, tieOrder.get(descriptor.policy.id));
    });
    return { rules, ruleIds };
  }

  compilePolicies(policies, options) {
    return this.compilePolicySet(policies, options).rules;
  }

  compileSessionPolicy(policy) {
    return this.compilePolicies([policy], { temporary: true })[0];
  }
}

function ruleDescriptors(policy) {
  if (policy.resourceType !== RESOURCE_TYPE.COOKIE) return [{ key: `${policy.id}#request`, policy, header: null }];
  return [
    { key: `${policy.id}#request-cookie`, policy, header: "request" },
    { key: `${policy.id}#response-cookie`, policy, header: "response" },
  ];
}

function compileRule({ policy, header }, id, tiePriority) {
  const condition = compileCondition(policy);
  let action = { type: policy.action };
  if (header === "request") {
    action = { type: "modifyHeaders", requestHeaders: [{ header: "cookie", operation: "remove" }] };
  } else if (header === "response") {
    action = { type: "modifyHeaders", responseHeaders: [{ header: "set-cookie", operation: "remove" }] };
  }
  return { id, priority: specificity(policy) * PRIORITY_SCALE + tiePriority, action, condition };
}

function compileCondition(policy) {
  const condition = {};
  if (policy.scope !== WILDCARD) condition.initiatorDomains = [policy.scope];
  if (policy.target !== WILDCARD) condition.requestDomains = [policy.target];
  if (policy.party !== PARTY.ANY) condition.domainType = policy.party;
  if (policy.resourceType === RESOURCE_TYPE.OTHER) condition.resourceTypes = OTHER_RESOURCE_TYPES;
  else if (policy.resourceType !== RESOURCE_TYPE.ALL && policy.resourceType !== RESOURCE_TYPE.COOKIE) {
    condition.resourceTypes = [policy.resourceType];
  }
  if (policy.temporary) condition.tabIds = [policy.tabId];
  if (Object.keys(condition).length === 0) condition.urlFilter = "*";
  return condition;
}
