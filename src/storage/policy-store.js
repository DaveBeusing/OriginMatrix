import { POLICY_ACTION, createPolicy, policyIdentity } from "../shared/models.js";
import { migratePolicyDocument } from "./migration.js";

const PERSISTENT_KEY = "policyDocument";
const SESSION_KEY = "sessionPolicyDocument";

export class PolicyStore {
  constructor({ localArea = chrome.storage.local, sessionArea = chrome.storage.session } = {}) {
    this.localArea = localArea;
    this.sessionArea = sessionArea;
  }

  async getPersistentPolicies() { return (await this.#read(this.localArea, PERSISTENT_KEY)).policies; }
  async getTemporaryPolicies() { return (await this.#read(this.sessionArea, SESSION_KEY)).policies; }

  async getAllPolicies() {
    const [persistent, temporary] = await Promise.all([this.getPersistentPolicies(), this.getTemporaryPolicies()]);
    return [...persistent, ...temporary];
  }

  async putPolicy(input) {
    const policy = createPolicy(input);
    const area = policy.temporary ? this.sessionArea : this.localArea;
    const key = policy.temporary ? SESSION_KEY : PERSISTENT_KEY;
    const document = await this.#read(area, key);
    const identity = policyIdentity(policy);
    document.policies = document.policies.filter((item) => policyIdentity(item) !== identity);
    if (policy.action !== POLICY_ACTION.INHERIT) document.policies.push(policy);
    await area.set({ [key]: document });
    return policy.action === POLICY_ACTION.INHERIT ? null : policy;
  }

  async removePolicy(policyId, { temporary = false } = {}) {
    const area = temporary ? this.sessionArea : this.localArea;
    const key = temporary ? SESSION_KEY : PERSISTENT_KEY;
    const document = await this.#read(area, key);
    document.policies = document.policies.filter((policy) => policy.id !== policyId);
    delete document.ruleIds[policyId];
    await area.set({ [key]: document });
  }

  async getTemporaryPolicy(tabId) {
    return (await this.getTemporaryPolicies()).find((policy) => policy.tabId === tabId) ?? null;
  }

  async setTemporaryPolicy(policy) { return this.putPolicy({ ...policy, temporary: true }); }

  async removeTemporaryPolicy(tabId) {
    const document = await this.#read(this.sessionArea, SESSION_KEY);
    document.policies = document.policies.filter((policy) => policy.tabId !== tabId);
    await this.sessionArea.set({ [SESSION_KEY]: document });
  }

  async setRuleIds(mapping, { temporary = false } = {}) {
    const area = temporary ? this.sessionArea : this.localArea;
    const key = temporary ? SESSION_KEY : PERSISTENT_KEY;
    const document = await this.#read(area, key);
    document.ruleIds = Object.fromEntries(mapping);
    await area.set({ [key]: document });
  }

  async #read(area, key) {
    const value = await area.get(key);
    return migratePolicyDocument(value[key]);
  }
}
