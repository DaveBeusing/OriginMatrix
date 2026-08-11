const KEY = "preparedFilterGenerationCache";
export const PREPARED_CACHE_SCHEMA_VERSION = 1;
export const FILTER_COMPILER_SCHEMA_VERSION = 3;
export const PREPARED_CACHE_MAX_BYTES = 4_000_000;

export class PreparedGenerationCacheStore {
  constructor(storageArea = chrome.storage.local) { this.storageArea = storageArea; }

  async get(identity) {
    let value;
    try { value = (await this.storageArea.get(KEY))[KEY]; }
    catch (error) { return { state: "invalid", error: error.message, size: 0 }; }
    if (value === undefined) return { state: "miss", size: 0 };
    const size = serializedSize(value);
    if (size > PREPARED_CACHE_MAX_BYTES || !validDocument(value)) return { state: "invalid", size };
    if (stableStringify(value.identity) !== stableStringify(identity)) return { state: "miss", size };
    return { state: "hit", size, compilation: structuredClone(value.compilation) };
  }

  async set(identity, compilation) {
    const document = { schemaVersion: PREPARED_CACHE_SCHEMA_VERSION, identity: structuredClone(identity), compilation: structuredClone(compilation) };
    const size = serializedSize(document);
    if (!validDocument(document)) throw new TypeError("Invalid prepared filter cache generation.");
    if (size > PREPARED_CACHE_MAX_BYTES) return { stored: false, size, reason: "size-limit" };
    await this.storageArea.set({ [KEY]: document });
    return { stored: true, size };
  }
}

export function createPreparedCacheIdentity({ sourceChecksum, featureKey, reservedDynamicRules }) {
  if (!/^[a-f0-9]{64}$/.test(sourceChecksum) || typeof featureKey !== "string" || !Number.isInteger(reservedDynamicRules) || reservedDynamicRules < 0) throw new TypeError("Invalid prepared cache identity.");
  return Object.freeze({ sourceChecksum, featureKey, reservedDynamicRules, compilerSchemaVersion: FILTER_COMPILER_SCHEMA_VERSION });
}

function validDocument(value) {
  return Boolean(value && value.schemaVersion === PREPARED_CACHE_SCHEMA_VERSION
    && value.identity && value.identity.compilerSchemaVersion === FILTER_COMPILER_SCHEMA_VERSION
    && /^[a-f0-9]{64}$/.test(value.identity.sourceChecksum) && typeof value.identity.featureKey === "string"
    && Number.isInteger(value.identity.reservedDynamicRules) && value.identity.reservedDynamicRules >= 0
    && value.compilation && validRules(value.compilation.rules)
    && value.compilation.attributions && typeof value.compilation.attributions === "object" && !Array.isArray(value.compilation.attributions)
    && value.compilation.diagnostics && typeof value.compilation.diagnostics === "object");
}

function validRules(rules) {
  if (!Array.isArray(rules) || rules.length > 400_000) return false;
  const ids = new Set();
  for (const rule of rules) {
    if (!rule || !Number.isInteger(rule.id) || rule.id <= 0 || ids.has(rule.id) || !Number.isInteger(rule.priority) || rule.priority <= 0
      || !rule.action || typeof rule.action.type !== "string" || !rule.condition || typeof rule.condition !== "object" || Array.isArray(rule.condition)) return false;
    ids.add(rule.id);
  }
  return true;
}

function serializedSize(value) { try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return Number.POSITIVE_INFINITY; } }
function stableStringify(value) { if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`; return JSON.stringify(value); }
