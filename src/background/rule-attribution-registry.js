import { DYNAMIC_RULE_RANGES, SESSION_RULE_RANGE } from "../network/rule-ranges.js";

export class RuleAttributionRegistry {
  constructor() { this.rules = new Map(); }

  replace({ dynamicRules = [], sessionRules = [] } = {}) {
    this.rules = new Map([
      ...dynamicRules.map((rule) => [key("_dynamic", rule.id), attributionFor(rule, false)]),
      ...sessionRules.map((rule) => [key("_session", rule.id), attributionFor(rule, true)]),
    ]);
  }

  resolve({ rulesetId, ruleId }) {
    const known = this.rules.get(key(rulesetId, ruleId));
    if (known) return known;
    if (rulesetId === "base-network") return Object.freeze({ decision: "blocked", engine: "network", source: "Base network rules", category: ruleId === 1 ? "ads" : null });
    if (rulesetId === "_dynamic" && inRange(ruleId, DYNAMIC_RULE_RANGES.filters)) return unknown("network", "Filter list");
    if (rulesetId === "_dynamic" && inRange(ruleId, DYNAMIC_RULE_RANGES.matrix)) return unknown("matrix", "Persistent Matrix");
    if (rulesetId === "_session" && inRange(ruleId, SESSION_RULE_RANGE)) return unknown("matrix", "Temporary Matrix");
    return unknown("unknown", rulesetId);
  }
}

function attributionFor(rule, temporary) {
  const filter = inRange(rule.id, DYNAMIC_RULE_RANGES.filters);
  return Object.freeze({
    decision: decisionForAction(rule.action?.type),
    engine: filter ? "network" : "matrix",
    source: filter ? "EasyList" : temporary ? "Temporary Matrix" : "Persistent Matrix",
    category: filter ? "ads" : null,
  });
}

function decisionForAction(action) {
  if (action === "block") return "blocked";
  if (action === "allow" || action === "allowAllRequests") return "allowed";
  if (action === "modifyHeaders" || action === "redirect" || action === "upgradeScheme") return "modified";
  return "unknown";
}

function unknown(engine, source) { return Object.freeze({ decision: "unknown", engine, source, category: null }); }
function inRange(id, range) { return Number.isInteger(id) && id >= range.minimum && id <= range.maximum; }
function key(rulesetId, ruleId) { return `${rulesetId}:${ruleId}`; }
