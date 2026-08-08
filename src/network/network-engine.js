import { DynamicRuleManager } from "./dynamic-rule-manager.js";
import { RuleBudget } from "./rule-budget.js";
import { SessionRuleManager } from "./session-rule-manager.js";
import { StaticRuleManager } from "./static-rule-manager.js";

export class NetworkEngine {
  constructor({ api = chrome.declarativeNetRequest, budget = new RuleBudget() } = {}) {
    this.api = api;
    this.budget = budget;
    this.dynamic = new DynamicRuleManager({ api, budget });
    this.session = new SessionRuleManager({ api, budget });
    this.static = new StaticRuleManager({ api, budget });
  }

  replaceRules({ temporary, rules }) {
    return temporary ? this.session.replace(rules) : this.dynamic.replace(rules);
  }

  getDynamicRules() { return this.dynamic.getRules(); }
  getSessionRules() { return this.session.getRules(); }

  async getDiagnostics() {
    const [dynamicRules, sessionRules, enabledStaticRulesets, availableStaticRules] = await Promise.all([
      this.dynamic.getRules(),
      this.session.getRules(),
      this.static.getEnabledRulesets(),
      this.static.getAvailableRuleCount(),
    ]);
    return {
      dynamicRules,
      sessionRules,
      enabledStaticRulesets,
      availableStaticRules,
      budget: this.budget.account({ dynamic: dynamicRules.length, session: sessionRules.length }),
    };
  }
}
