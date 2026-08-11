import { DYNAMIC_RULE_RANGES, SESSION_RULE_RANGE } from "../network/rule-ranges.js";

const STATIC_SOURCES = Object.freeze({
  core_easylist: "EasyList", core_easyprivacy: "EasyPrivacy",
  core_ublock_ads: "uBlock filters – Ads", core_ublock_privacy: "uBlock filters – Privacy",
  core_ublock_unbreak: "uBlock filters – Unbreak",
});

export class RuleAttributionRegistry {
  constructor() { this.rules = new Map(); }

  replace({ dynamicRules = [], sessionRules = [], filterAttributions = {} } = {}) {
    this.rules = new Map([
      ...dynamicRules.map((rule) => [key("_dynamic", rule.id), attributionFor(rule, false, filterAttributions[rule.id])]),
      ...sessionRules.map((rule) => [key("_session", rule.id), attributionFor(rule, true)]),
    ]);
  }

  resolve({ rulesetId, ruleId, url = "" }) {
    const known = this.rules.get(key(rulesetId, ruleId));
    if (known) return selectAttribution(known, url);
    if (rulesetId === "base-network") return Object.freeze({ decision: "blocked", engine: "network", source: "Base network rules", rule: `base-network:${ruleId}`, category: ruleId === 1 ? "ads" : null });
    if (STATIC_SOURCES[rulesetId]) return Object.freeze({ decision: "unknown", engine: "network", source: STATIC_SOURCES[rulesetId], rule: `${rulesetId}:${ruleId}`, category: /privacy/i.test(STATIC_SOURCES[rulesetId]) ? "trackers" : "ads" });
    if (rulesetId === "_dynamic" && inRange(ruleId, DYNAMIC_RULE_RANGES.filters)) return unknown("network", "Filter list");
    if (rulesetId === "_dynamic" && inRange(ruleId, DYNAMIC_RULE_RANGES.matrix)) return unknown("matrix", "Persistent Matrix");
    if (rulesetId === "_session" && inRange(ruleId, SESSION_RULE_RANGE)) return unknown("matrix", "Temporary Matrix");
    return unknown("unknown", rulesetId);
  }
}

function attributionFor(rule, temporary, candidates = []) {
  const filter = inRange(rule.id, DYNAMIC_RULE_RANGES.filters);
  return Object.freeze({
    decision: decisionForAction(rule.action?.type),
    engine: filter ? "network" : "matrix",
    source: filter ? "Filter list" : temporary ? "Session Override" : "User Matrix Policy",
    rule: filter ? null : describeMatrixRule(rule),
    candidates: filter ? candidates : [],
    category: filter ? null : null,
  });
}

function selectAttribution(attribution, url) {
  if (!attribution.candidates?.length) { const { candidates, ...result } = attribution; return Object.freeze(result); }
  const hostname = safeHostname(url);
  const candidate = attribution.candidates.find(({ rule }) => { const match = rule.match(/^@@?\|\|([^\^/$*]+)|^\|\|([^\^/$*]+)/); const domain = match?.[1] ?? match?.[2]; return domain && (hostname === domain || hostname.endsWith(`.${domain}`)); }) ?? attribution.candidates[0];
  const source = candidate.source;
  return Object.freeze({ decision: attribution.decision, engine: attribution.engine, source, rule: candidate.rule, category: /privacy/i.test(source) ? "trackers" : "ads" });
}

function describeMatrixRule(rule) {
  const condition = rule.condition ?? {};
  return `${rule.action?.type ?? "unknown"} ${condition.initiatorDomains?.join(",") ?? "*"} → ${condition.requestDomains?.join(",") ?? "*"} (${condition.domainType ?? "any"}, ${condition.resourceTypes?.join(",") ?? "all"})`;
}

function safeHostname(value) { try { return new URL(value).hostname.toLowerCase(); } catch { return ""; } }

function decisionForAction(action) {
  if (action === "block") return "blocked";
  if (action === "allow" || action === "allowAllRequests") return "allowed";
  if (action === "modifyHeaders" || action === "redirect" || action === "upgradeScheme") return "modified";
  return "unknown";
}

function unknown(engine, source) { return Object.freeze({ decision: "unknown", engine, source, rule: null, category: null }); }
function inRange(id, range) { return Number.isInteger(id) && id >= range.minimum && id <= range.maximum; }
function key(rulesetId, ruleId) { return `${rulesetId}:${ruleId}`; }
