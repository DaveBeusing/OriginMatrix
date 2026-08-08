import { stableHash } from "../engine/rule-id-manager.js";
import { RuleBudget } from "../network/rule-budget.js";
import { DYNAMIC_RULE_RANGES } from "../network/rule-ranges.js";
import { FILTER_TYPE, validateFilter } from "./filter-model.js";

const FILTER_RULE_MIN = DYNAMIC_RULE_RANGES.filters.minimum;
const FILTER_RULE_SIZE = DYNAMIC_RULE_RANGES.filters.maximum - FILTER_RULE_MIN + 1;
const BLOCK_PRIORITY = 10_000;
const EXCEPTION_PRIORITY = 20_000;
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

    const normalized = filters.map(validateFilter);
    const networkFilters = normalized.filter(({ type }) => type === FILTER_TYPE.NETWORK || type === FILTER_TYPE.EXCEPTION);
    const uniqueFilters = deduplicate(networkFilters);
    const unoptimizedRules = uniqueFilters.map(compileCondition);
    const aggregatedRules = aggregateHostRules(unoptimizedRules);
    const rules = assignRuleIds(aggregatedRules);
    this.budget.assertWithin("dynamic", reservedDynamicRules + rules.length);

    return Object.freeze({
      rules: Object.freeze(rules),
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
      }),
    });
  }
}

function compileCondition(filter) {
  const condition = {};
  const hostMatch = filter.pattern.match(HOST_PATTERN);
  if (hostMatch) condition.requestDomains = [hostMatch[1].toLowerCase()];
  else condition.urlFilter = filter.pattern;
  if (filter.domains.length > 0) condition.initiatorDomains = filter.domains;
  if (filter.excludedDomains.length > 0) condition.excludedInitiatorDomains = filter.excludedDomains;
  if (filter.resourceTypes.length > 0) condition.resourceTypes = filter.resourceTypes;
  if (filter.thirdParty !== null) condition.domainType = filter.thirdParty ? "thirdParty" : "firstParty";
  return {
    priority: filter.type === FILTER_TYPE.EXCEPTION ? EXCEPTION_PRIORITY : BLOCK_PRIORITY,
    action: { type: filter.type === FILTER_TYPE.EXCEPTION ? "allow" : "block" },
    condition,
  };
}

function deduplicate(filters) {
  const bySignature = new Map();
  for (const filter of filters) bySignature.set(stableStringify(filter), filter);
  return [...bySignature.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, filter]) => filter);
}

function aggregateHostRules(rules) {
  const groups = new Map();
  const standalone = [];
  for (const rule of rules) {
    if (!rule.condition.requestDomains) {
      standalone.push(rule);
      continue;
    }
    const { requestDomains, ...rest } = rule.condition;
    const key = stableStringify({ priority: rule.priority, action: rule.action, condition: rest });
    const group = groups.get(key) ?? { ...rule, condition: { ...rest, requestDomains: [] } };
    group.condition.requestDomains.push(...requestDomains);
    groups.set(key, group);
  }
  return [...standalone, ...groups.values().map((rule) => ({
    ...rule,
    condition: { ...rule.condition, requestDomains: [...new Set(rule.condition.requestDomains)].sort() },
  }))];
}

function assignRuleIds(rules) {
  const used = new Set();
  return [...rules]
    .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
    .map((rule) => {
      const signature = stableStringify(rule);
      let id = FILTER_RULE_MIN + (stableHash(signature) % FILTER_RULE_SIZE);
      while (used.has(id)) id = FILTER_RULE_MIN + ((id - FILTER_RULE_MIN + 1) % FILTER_RULE_SIZE);
      used.add(id);
      return Object.freeze({ id, ...rule, action: Object.freeze(rule.action), condition: Object.freeze(rule.condition) });
    });
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const NETWORK_FILTER_PRIORITY = Object.freeze({ block: BLOCK_PRIORITY, exception: EXCEPTION_PRIORITY });
export const NETWORK_FILTER_RULE_RANGE = Object.freeze({ minimum: FILTER_RULE_MIN, maximum: FILTER_RULE_MIN + FILTER_RULE_SIZE - 1 });
