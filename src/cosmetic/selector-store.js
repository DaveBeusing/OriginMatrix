import { FILTER_TYPE, validateFilter } from "../filters/filter-model.js";

const MAX_NATIVE_SELECTORS_PER_DOCUMENT = 20_000;
const MAX_DYNAMIC_SELECTORS_PER_DOCUMENT = 5_000;
const MAX_CACHED_HOSTNAMES = 128;

export class SelectorStore {
  constructor() {
    this.byDomain = new Map();
    this.global = [];
    this.cache = new Map();
  }

  replace(filters) {
    if (!Array.isArray(filters)) throw new TypeError("Selectors must be an array.");
    const byDomain = new Map();
    const global = [];
    for (const input of filters) {
      const filter = validateFilter(input);
      if (filter.type !== FILTER_TYPE.COSMETIC) throw new TypeError("SelectorStore accepts cosmetic filters only.");
      if (filter.domains.length === 0) global.push(filter);
      for (const domain of filter.domains) {
        const entries = byDomain.get(domain) ?? [];
        entries.push(filter);
        byDomain.set(domain, entries);
      }
    }
    this.byDomain = byDomain;
    this.global = global;
    this.cache.clear();
  }

  getForHostname(hostname, options) { return this.getPlanForHostname(hostname, options).nativeSelectors; }

  getPlanForHostname(hostname, { includeGlobal = true } = {}) {
    const normalized = normalizeHostname(hostname);
    const cacheKey = `${normalized}:${includeGlobal ? "global" : "site"}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
    const siteCandidates = [];
    const labels = normalized.split(".");
    for (let index = 0; index < labels.length; index += 1) {
      siteCandidates.push(...(this.byDomain.get(labels.slice(index).join(".")) ?? []));
    }
    const candidates = [...(includeGlobal ? this.global : []), ...siteCandidates];
    const applicable = candidates.filter(({ excludedDomains }) => (
      !excludedDomains.some((domain) => domainMatches(normalized, domain))
    ));
    const applicableSite = siteCandidates.filter(({ excludedDomains }) => (
      !excludedDomains.some((domain) => domainMatches(normalized, domain))
    ));
    const exceptions = new Set(applicable.filter(({ exception }) => exception === true).map(({ selector }) => selector));
    const effective = (filters, maximum) => [...new Set(filters
      .filter(({ exception, selector }) => exception !== true && !exceptions.has(selector))
      .map(({ selector }) => selector))].sort().slice(0, maximum);
    const plan = Object.freeze({
      nativeSelectors: Object.freeze(effective(applicable, MAX_NATIVE_SELECTORS_PER_DOCUMENT)),
      dynamicSelectors: Object.freeze(effective(applicableSite, MAX_DYNAMIC_SELECTORS_PER_DOCUMENT)),
    });
    if (this.cache.size >= MAX_CACHED_HOSTNAMES) this.cache.delete(this.cache.keys().next().value);
    this.cache.set(cacheKey, plan);
    return plan;
  }

  getDiagnostics() {
    return Object.freeze({ cosmeticFilters: this.global.length + [...this.byDomain.values()].reduce((count, entries) => count + entries.length, 0), globalCosmeticFilters: this.global.length, indexedDomains: this.byDomain.size, cachedHostnames: this.cache.size });
  }
}

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Hostname must be a string.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes("/") || hostname.includes(":")) throw new TypeError("Invalid cosmetic hostname.");
  return hostname;
}

function domainMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}
