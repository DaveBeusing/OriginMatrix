import { validateCustomFilters } from "../filters/custom-filter-validator.js";

const KEY = "customFilterDocument";
const SCHEMA_VERSION = 1;

export class CustomFilterStore {
  constructor(storageArea = chrome.storage.local) { this.storageArea = storageArea; }

  async get() {
    const value = (await this.storageArea.get(KEY))[KEY];
    if (value === undefined) return Object.freeze({ schemaVersion: SCHEMA_VERSION, source: "" });
    if (!value || value.schemaVersion !== SCHEMA_VERSION || typeof value.source !== "string") throw new TypeError("Unsupported or invalid My Filters document.");
    if (!validateCustomFilters(value.source).valid) throw new TypeError("Stored My Filters contains unsupported rules.");
    return Object.freeze({ schemaVersion: SCHEMA_VERSION, source: value.source });
  }

  async set(source) {
    const validation = validateCustomFilters(source);
    if (!validation.valid) throw new TypeError("My Filters contains unsupported rules.");
    const document = { schemaVersion: SCHEMA_VERSION, source };
    await this.storageArea.set({ [KEY]: document });
    return Object.freeze(document);
  }
}
