const GENERATIONS_KEY = "filterListGenerations";
const SCHEMA_VERSION = 1;
const MAX_SOURCE_BYTES = 5_000_000;

export class FilterListGenerationStore {
  constructor({ listIds, localArea = chrome.storage.local } = {}) {
    if (!Array.isArray(listIds) || listIds.some((id) => typeof id !== "string" || !id)) throw new TypeError("Filter list IDs are required.");
    this.listIds = new Set(listIds);
    this.localArea = localArea;
  }

  async get(id) {
    this.#assertId(id);
    const document = await this.#read();
    return document.generations[id] ?? null;
  }

  async set(id, generation) {
    this.#assertId(id);
    validateGeneration(generation);
    const document = await this.#read();
    document.generations[id] = { ...generation };
    await this.localArea.set({ [GENERATIONS_KEY]: document });
  }

  async #read() {
    const stored = (await this.localArea.get(GENERATIONS_KEY))[GENERATIONS_KEY];
    if (stored === undefined) return { schemaVersion: SCHEMA_VERSION, generations: {} };
    if (!stored || stored.schemaVersion !== SCHEMA_VERSION || !stored.generations || typeof stored.generations !== "object" || Array.isArray(stored.generations)) {
      throw new TypeError("Invalid filter list generation document.");
    }
    for (const [id, generation] of Object.entries(stored.generations)) {
      this.#assertId(id);
      validateGeneration(generation);
    }
    return structuredClone(stored);
  }

  #assertId(id) { if (!this.listIds.has(id)) throw new TypeError(`Unknown filter list: ${id}`); }
}

function validateGeneration(value) {
  if (!value || typeof value.source !== "string" || new TextEncoder().encode(value.source).length > MAX_SOURCE_BYTES
    || typeof value.version !== "string" || !value.version || typeof value.lastUpdated !== "string"
    || !Number.isFinite(Date.parse(value.lastUpdated)) || !/^[a-f0-9]{64}$/.test(value.checksum)) {
    throw new TypeError("Invalid stored filter list generation.");
  }
}

export const FILTER_LIST_MAX_SOURCE_BYTES = MAX_SOURCE_BYTES;
