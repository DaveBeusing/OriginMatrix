import { FILTER_TYPE, validateFilter } from "../filters/filter-model.js";

const MAX_SELECTORS_PER_DOCUMENT = 5_000;

export class SelectorStore {
  constructor() {
    this.byDomain = new Map();
    this.global = [];
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
  }

  getForHostname(hostname) {
    const normalized = normalizeHostname(hostname);
    const candidates = [...this.global];
    const labels = normalized.split(".");
    for (let index = 0; index < labels.length; index += 1) {
      candidates.push(...(this.byDomain.get(labels.slice(index).join(".")) ?? []));
    }
    const applicable = candidates.filter(({ excludedDomains }) => (
      !excludedDomains.some((domain) => domainMatches(normalized, domain))
    ));
    const exceptions = new Set(applicable.filter(({ exception }) => exception === true).map(({ selector }) => selector));
    return [...new Set(applicable
      .filter(({ exception, selector }) => exception !== true && !exceptions.has(selector))
      .map(({ selector }) => selector))].sort().slice(0, MAX_SELECTORS_PER_DOCUMENT);
  }

  getDiagnostics() {
    return Object.freeze({ cosmeticFilters: this.global.length + [...this.byDomain.values()].reduce((count, entries) => count + entries.length, 0), indexedDomains: this.byDomain.size });
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
