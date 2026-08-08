const SETTINGS_KEY = "filterListSettings";
const SCHEMA_VERSION = 1;

export class FilterListSettingsStore {
  constructor({ lists, localArea = chrome.storage.local } = {}) {
    if (!Array.isArray(lists) || lists.some((list) => !list?.id || typeof list.enabled !== "boolean")) {
      throw new TypeError("Filter list defaults are required.");
    }
    this.defaults = new Map(lists.map((list) => [list.id, list.enabled]));
    this.localArea = localArea;
  }

  async getAll() {
    const stored = (await this.localArea.get(SETTINGS_KEY))[SETTINGS_KEY];
    if (stored === undefined) return Object.freeze(this.#defaults());
    if (!stored || stored.schemaVersion !== SCHEMA_VERSION || !stored.lists || typeof stored.lists !== "object" || Array.isArray(stored.lists)) {
      throw new TypeError("Invalid filter list settings document.");
    }
    const settings = this.#defaults();
    for (const [id, value] of Object.entries(stored.lists)) {
      if (!this.defaults.has(id) || !value || typeof value.enabled !== "boolean") {
        throw new TypeError(`Invalid filter list setting: ${id}`);
      }
      settings[id] = Object.freeze({ enabled: value.enabled });
    }
    return Object.freeze(settings);
  }

  async setEnabled(id, enabled) {
    if (!this.defaults.has(id)) throw new TypeError(`Unknown filter list: ${id}`);
    if (typeof enabled !== "boolean") throw new TypeError("Filter list enabled state must be boolean.");
    const lists = { ...(await this.getAll()), [id]: { enabled } };
    await this.localArea.set({ [SETTINGS_KEY]: { schemaVersion: SCHEMA_VERSION, lists } });
  }

  #defaults() {
    return Object.fromEntries([...this.defaults].map(([id, enabled]) => [id, Object.freeze({ enabled })]));
  }
}
