import { PARTY, POLICY_ACTION, RESOURCE_TYPE, WILDCARD, validatePolicy } from "../shared/models.js";
import { specificity } from "./policy-resolver.js";
import { RuleIdManager } from "./rule-id-manager.js";

const PRIORITY_SCALE = 1_000_000;

export class DnrCompiler {
  constructor(ruleIdManager = new RuleIdManager()) {
    this.ruleIdManager = ruleIdManager;
  }

  compilePolicies(policies, { temporary = false } = {}) {
    const compilable = policies.map((policy) => validatePolicy(policy, { allowInherit: false }));
    if (compilable.some((policy) => policy.temporary !== temporary)) {
      throw new TypeError(`Expected only ${temporary ? "temporary" : "persistent"} policies.`);
    }
    const ids = this.ruleIdManager.assign(compilable);
    const tieOrder = new Map([...compilable]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((policy, index, sorted) => [policy.id, sorted.length - index]));
    if (compilable.length >= PRIORITY_SCALE) throw new RangeError("Too many policies for deterministic priority allocation.");
    return compilable.map((policy) => compileRule(policy, ids.get(policy.id), tieOrder.get(policy.id)));
  }

  compileSessionPolicy(policy) {
    return this.compilePolicies([policy], { temporary: true })[0];
  }
}

function compileRule(policy, id, tiePriority) {
  const condition = {};
  if (policy.scope !== WILDCARD) condition.initiatorDomains = [policy.scope];
  if (policy.target !== WILDCARD) condition.requestDomains = [policy.target];
  if (policy.party !== PARTY.ANY) condition.domainType = policy.party;
  if (policy.resourceType !== RESOURCE_TYPE.ALL) condition.resourceTypes = [policy.resourceType];
  if (policy.temporary) condition.tabIds = [policy.tabId];
  if (Object.keys(condition).length === 0) condition.urlFilter = "*";

  return {
    id,
    priority: specificity(policy) * PRIORITY_SCALE + tiePriority,
    action: { type: policy.action },
    condition,
  };
}
