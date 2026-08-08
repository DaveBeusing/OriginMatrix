import { POLICY_ACTION, createPolicy, policyIdentity } from "../shared/models.js";

export class PolicyEngine {
  constructor({ store, resolver, compiler, networkEngine }) {
    this.store = store;
    this.resolver = resolver;
    this.compiler = compiler;
    this.networkEngine = networkEngine;
  }

  async resolve(request) { return this.resolver.resolve(request, await this.store.getAllPolicies()); }

  async apply(input) {
    const policy = createPolicy(input);
    const existing = policy.temporary ? await this.store.getTemporaryPolicies() : await this.store.getPersistentPolicies();
    const previous = existing.find((item) => policyIdentity(item) === policyIdentity(policy)) ?? null;
    await this.store.putPolicy(policy);
    try {
      await this.recompile({ temporary: policy.temporary });
    } catch (error) {
      if (previous) await this.store.putPolicy(previous);
      else await this.store.removePolicy(policy.id, { temporary: policy.temporary });
      throw error;
    }
    return policy;
  }

  async recompile({ temporary }) {
    const policies = temporary ? await this.store.getTemporaryPolicies() : await this.store.getPersistentPolicies();
    const compilable = policies.filter((policy) => policy.action !== POLICY_ACTION.INHERIT);
    const { rules, ruleIds } = this.compiler.compilePolicySet(compilable, { temporary });
    await this.store.setRuleIds(ruleIds, { temporary });
    await this.networkEngine.replaceRules({ temporary, rules });
    return rules;
  }
}
