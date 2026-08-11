import { stableHash } from "../engine/rule-id-manager.js";
import { RuleBudget } from "../network/rule-budget.js";
import { DYNAMIC_RULE_RANGES } from "../network/rule-ranges.js";
import { FILTER_TYPE, validateFilter } from "./filter-model.js";
import { filterSemanticPrecedence, resolveFilterSemantics } from "./filter-semantics-resolver.js";

const FILTER_RULE_MIN = DYNAMIC_RULE_RANGES.filters.minimum;
const FILTER_RULE_SIZE = DYNAMIC_RULE_RANGES.filters.maximum - FILTER_RULE_MIN + 1;
const BLOCK_PRIORITY = 10_000;
const EXCEPTION_PRIORITY = 20_000;
const IMPORTANT_BLOCK_PRIORITY = 30_000;
const IMPORTANT_EXCEPTION_PRIORITY = 40_000;
const MAX_AGGREGATED_DOMAINS = 1_000;
const HOST_PATTERN = /^\|\|([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*)\^$/i;

export class NetworkFilterCompiler {
  constructor({ budget = new RuleBudget() } = {}) {
    this.budget = budget;
  }

  compile(filters, { reservedDynamicRules = 0 } = {}) {
    if (!Array.isArray(filters)) throw new TypeError("Filters must be an array.");
    if (!Number.isInteger(reservedDynamicRules) || reservedDynamicRules < 0) {
      throw new TypeError("Reserved dynamic rule count must be a non-negative integer.");
    }

    const semantics = resolveFilterSemantics(filters);
    const normalized = semantics.filters.map(validateFilter);
    const networkFilters = normalized.filter(({ type }) => type === FILTER_TYPE.NETWORK || type === FILTER_TYPE.EXCEPTION);
    const uniqueFilters = deduplicate(networkFilters);
    const unoptimizedRules = uniqueFilters.map(compileCondition);
    const aggregatedRules = aggregateHostRules(unoptimizedRules);
    const assigned = assignRuleIds(aggregatedRules);
    const rules = assigned.map(({ rule }) => rule);
    this.budget.assertWithin("dynamic", reservedDynamicRules + rules.length);

    return Object.freeze({
      rules: Object.freeze(rules),
      attributions: Object.freeze(Object.fromEntries(assigned.map(({ rule, attributions }) => [rule.id, Object.freeze(attributions)]))),
      diagnostics: Object.freeze({
        filtersReceived: normalized.length,
        networkFilters: networkFilters.length,
        nonNetworkFilters: normalized.length - networkFilters.length,
        duplicatesRemoved: networkFilters.length - uniqueFilters.length,
        rulesBeforeOptimization: unoptimizedRules.length,
        rulesCompiled: rules.length,
        rulesOptimized: unoptimizedRules.length - rules.length,
        reservedDynamicRules,
        dynamicRulesRequired: reservedDynamicRules + rules.length,
        signatureCacheHits: assigned.length,
        ...semantics.diagnostics,
      }),
    });
  }
}

function compileCondition({ filter, attributions }) {
  const condition = {};
  const hostMatch = filter.pattern.match(HOST_PATTERN);
  if (hostMatch) condition.requestDomains = [hostMatch[1].toLowerCase()];
  else condition.urlFilter = filter.pattern;
  if (filter.domains.length > 0) condition.initiatorDomains = filter.domains;
  if (filter.excludedDomains.length > 0) condition.excludedInitiatorDomains = filter.excludedDomains;
  if (filter.resourceTypes.length > 0) condition.resourceTypes = filter.resourceTypes;
  if (filter.thirdParty !== null) condition.domainType = filter.thirdParty ? "thirdParty" : "firstParty";
  return { rule: {
    priority: priorityFor(filter),
    action: { type: filter.type === FILTER_TYPE.EXCEPTION ? "allow" : "block" },
    condition,
  }, attributions };
}

function priorityFor(filter) {
  const precedence = filterSemanticPrecedence(filter);
  return [0, BLOCK_PRIORITY, EXCEPTION_PRIORITY, IMPORTANT_BLOCK_PRIORITY, IMPORTANT_EXCEPTION_PRIORITY][precedence];
}

function deduplicate(filters) {
  const bySignature = new Map();
  for (const filter of filters) {
    const { sourceList, sourceRule, ...semanticFilter } = filter;
    const signature = stableStringify(semanticFilter);
    const entry = bySignature.get(signature) ?? { filter: semanticFilter, attributions: new Map() };
    const attribution = Object.freeze({ source: sourceList ?? "Filter list", rule: sourceRule ?? formatFilter(filter) });
    entry.attributions.set(stableStringify(attribution), attribution);
    bySignature.set(signature, entry);
  }
  return [...bySignature.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, entry]) => ({ filter: entry.filter, attributions: [...entry.attributions.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, attribution]) => attribution) }));
}

function aggregateHostRules(rules) {
  const groups = new Map();
  const standalone = [];
  for (const entry of rules) {
    const rule = entry.rule;
    if (!rule.condition.requestDomains) {
      standalone.push(entry);
      continue;
    }
    const { requestDomains, ...rest } = rule.condition;
    const key = stableStringify({ priority: rule.priority, action: rule.action, condition: rest });
    const group = groups.get(key) ?? { rule: { ...rule, condition: { ...rest, requestDomains: [] } }, attributions: [] };
    group.rule.condition.requestDomains.push(...requestDomains);
    group.attributions.push(...entry.attributions);
    groups.set(key, group);
  }
  const aggregated = [...groups.values()].flatMap((entry) => {
    const domains = [...new Set(entry.rule.condition.requestDomains)].sort();
    const chunks = [];
    for (let index = 0; index < domains.length; index += MAX_AGGREGATED_DOMAINS) {
      const chunkDomains = new Set(domains.slice(index, index + MAX_AGGREGATED_DOMAINS));
      chunks.push({ rule: { ...entry.rule, condition: { ...entry.rule.condition, requestDomains: [...chunkDomains] } }, attributions: entry.attributions.filter(({ rule }) => { const match = rule.match(/^@@?\|\|([^\^]+)\^|^\|\|([^\^]+)\^/); return !match || chunkDomains.has(match[1] ?? match[2]); }) });
    }
    return chunks;
  });
  return [...standalone, ...aggregated];
}

function assignRuleIds(rules) {
  const used = new Set();
  return rules
    .map(({ rule, attributions }) => ({ rule, attributions, signature: stableStringify(rule) }))
    .sort((left, right) => left.signature.localeCompare(right.signature))
    .map(({ rule, attributions, signature }) => {
      let id = FILTER_RULE_MIN + (stableHash(signature) % FILTER_RULE_SIZE);
      while (used.has(id)) id = FILTER_RULE_MIN + ((id - FILTER_RULE_MIN + 1) % FILTER_RULE_SIZE);
      used.add(id);
      return Object.freeze({ rule: Object.freeze({ id, ...rule, action: Object.freeze(rule.action), condition: Object.freeze(rule.condition) }), attributions });
    });
}

function formatFilter(filter) { return `${filter.type === FILTER_TYPE.EXCEPTION ? "@@" : ""}${filter.pattern}`; }

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const NETWORK_FILTER_PRIORITY = Object.freeze({ block: BLOCK_PRIORITY, exception: EXCEPTION_PRIORITY, importantBlock: IMPORTANT_BLOCK_PRIORITY, importantException: IMPORTANT_EXCEPTION_PRIORITY });
export const NETWORK_FILTER_RULE_RANGE = Object.freeze({ minimum: FILTER_RULE_MIN, maximum: FILTER_RULE_MIN + FILTER_RULE_SIZE - 1 });
