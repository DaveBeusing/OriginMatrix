import { FILTER_TYPE, validateFilter } from "./filter-model.js";

const HOST_PATTERN = /^\|\|([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)\^$/i;
const INHERIT = Object.freeze({ action: "inherit", source: null, matchedFilters: 0 });

export class AutomaticFilterResolver {
  constructor() {
    this.filters = Object.freeze([]);
    this.byTarget = new Map();
    this.source = null;
  }

  prepare(filters, { source } = {}) {
    if (!Array.isArray(filters)) throw new TypeError("Automatic filter input must be an array.");
    if (typeof source !== "string" || source.trim().length === 0) throw new TypeError("Automatic filter source is required.");
    const indexed = [];
    for (const input of filters) {
      if (![FILTER_TYPE.NETWORK, FILTER_TYPE.EXCEPTION].includes(input?.type)) continue;
      const filter = validateFilter(input);
      const match = filter.pattern.match(HOST_PATTERN);
      if (match) indexed.push(Object.freeze({ filter, target: match[1].toLowerCase() }));
    }
    return Object.freeze({ filters: Object.freeze(indexed), source: source.trim() });
  }

  activate(generation) {
    if (!generation || !Array.isArray(generation.filters) || typeof generation.source !== "string") {
      throw new TypeError("Invalid automatic filter generation.");
    }
    this.filters = Object.freeze([...generation.filters]);
    const byTarget = new Map();
    for (const entry of this.filters) {
      const entries = byTarget.get(entry.target) ?? [];
      entries.push(entry);
      byTarget.set(entry.target, entries);
    }
    this.byTarget = new Map([...byTarget].map(([target, entries]) => [target, Object.freeze(entries)]));
    this.source = generation.source;
    return Object.freeze({ automaticFiltersIndexed: this.filters.length });
  }

  clear() { this.filters = Object.freeze([]); this.byTarget = new Map(); this.source = null; }

  resolve({ topDomain, targetDomain, resourceType, party }) {
    if (!this.source) return INHERIT;
    const site = normalizeHostname(topDomain);
    const target = normalizeHostname(targetDomain);
    const candidates = [];
    const labels = target.split(".");
    for (let index = 0; index < labels.length; index += 1) {
      candidates.push(...(this.byTarget.get(labels.slice(index).join(".")) ?? []));
    }
    const matches = candidates.filter(({ filter }) => (
      appliesToSite(filter, site)
      && appliesToResource(filter, resourceType)
      && (filter.thirdParty === null || filter.thirdParty === (party === "thirdParty"))
    ));
    if (matches.length === 0) return INHERIT;
    const exception = matches.some(({ filter }) => filter.type === FILTER_TYPE.EXCEPTION);
    return Object.freeze({ action: exception ? "allow" : "block", source: this.source, matchedFilters: matches.length });
  }
}

function appliesToSite(filter, site) {
  if (filter.excludedDomains.some((domain) => domainMatches(site, domain))) return false;
  return filter.domains.length === 0 || filter.domains.some((domain) => domainMatches(site, domain));
}

function appliesToResource(filter, resourceType) {
  if (resourceType === "cookie") return false;
  if (resourceType === "all") return filter.resourceTypes.length === 0;
  return filter.resourceTypes.length === 0 || filter.resourceTypes.includes(resourceType);
}

function domainMatches(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Automatic filter hostnames must be strings.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes(":") || hostname.includes("/")) throw new TypeError("Invalid automatic filter hostname.");
  return hostname;
}
