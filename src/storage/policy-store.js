const SESSION_POLICIES_KEY = "sessionPolicies";

export class PolicyStore {
  constructor(storageArea = chrome.storage.session) {
    this.storageArea = storageArea;
  }

  async getTemporaryPolicy(tabId) {
    const policies = await this.#getAll();
    return policies[String(tabId)] ?? null;
  }

  async setTemporaryPolicy(policy) {
    const policies = await this.#getAll();
    policies[String(policy.tabId)] = policy;
    await this.storageArea.set({ [SESSION_POLICIES_KEY]: policies });
  }

  async removeTemporaryPolicy(tabId) {
    const policies = await this.#getAll();
    delete policies[String(tabId)];
    await this.storageArea.set({ [SESSION_POLICIES_KEY]: policies });
  }

  async #getAll() {
    const result = await this.storageArea.get(SESSION_POLICIES_KEY);
    const policies = result[SESSION_POLICIES_KEY];
    return policies && typeof policies === "object" ? { ...policies } : {};
  }
}
