import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";
import { CosmeticParser } from "../cosmetic/cosmetic-parser.js";
import { ScriptletRegistry } from "../scriptlets/scriptlet-registry.js";

const TYPES = Object.freeze(["network", "cosmetic", "scriptlet"]);
const cosmeticParser = new CosmeticParser();
const scriptletRegistry = new ScriptletRegistry();

export function analyzeSiteFilterCoverage(source, { hostname, filterList = "Unknown", listVersion = "unknown" } = {}) {
  if (typeof source !== "string") throw new TypeError("Site coverage source must be filter text.");
  const site = normalizeHostname(hostname);
  const rules = [];
  const counts = Object.fromEntries(TYPES.map((type) => [type, { supported: 0, unsupported: 0 }]));

  source.split(/\r?\n/).forEach((line, index) => {
    const parsed = parseFilterRule(line);
    if (parsed.status === "ignored" || !isRelevant(parsed, line, site)) return;
    const evaluated = evaluateSupport(parsed, line);
    const type = evaluated.type;
    counts[type][evaluated.status] += 1;
    rules.push(Object.freeze({
      line: index + 1,
      type,
      status: evaluated.status,
      reason: evaluated.reason,
      sourceFilterList: filterList,
      source: line.slice(0, 300),
    }));
  });

  const coverage = Object.fromEntries(TYPES.map((type) => [type, summarize(counts[type])]));
  const total = summarize(TYPES.reduce((result, type) => ({
    supported: result.supported + counts[type].supported,
    unsupported: result.unsupported + counts[type].unsupported,
  }), { supported: 0, unsupported: 0 }));
  return Object.freeze({
    hostname: site,
    filterList,
    listVersion,
    coverage: Object.freeze({ ...coverage, total }),
    relevantRules: Object.freeze(rules),
    unsupportedRelevantRules: Object.freeze(rules.filter(({ status }) => status === "unsupported")),
  });
}

function isRelevant(parsed, source, hostname) {
  if (parsed.status !== "supported") return mentionedHostnames(source).some((domain) => domainsRelated(hostname, domain));
  const filter = parsed.filter;
  if ([...filter.domains, ...filter.excludedDomains].some((domain) => domainsRelated(hostname, domain))) return true;
  if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL, FILTER_TYPE.SCRIPTLET].includes(filter.type)) return filter.domains.length === 0;
  return mentionedHostnames(filter.pattern).some((domain) => domainsRelated(hostname, domain));
}

function mentionedHostnames(source) {
  return source.toLowerCase().match(/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/g) ?? [];
}

function supportedType(type) {
  if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(type)) return "cosmetic";
  if (type === FILTER_TYPE.SCRIPTLET) return "scriptlet";
  return "network";
}

function evaluateSupport(parsed, source) {
  if (parsed.status === "unsupported") return { type: unsupportedType(source), status: "unsupported", reason: parsed.reason };
  const type = supportedType(parsed.filter.type);
  if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(parsed.filter.type)) {
    const result = cosmeticParser.parseModels([parsed.filter]);
    if (result.unsupported.length > 0) return { type, status: "unsupported", reason: result.unsupported[0].reason };
  }
  if (parsed.filter.type === FILTER_TYPE.SCRIPTLET) {
    try { scriptletRegistry.createInvocation(parsed.filter.name, parsed.filter.args); }
    catch (error) { return { type, status: "unsupported", reason: error.message };
    }
  }
  return { type, status: "supported", reason: null };
}

function unsupportedType(source) {
  if (/(?:##|#@#|#%#)\+js\(/i.test(source) || /#%#/.test(source)) return "scriptlet";
  if (/(?:##|#@#|#\?#|#\$#)/.test(source)) return "cosmetic";
  return "network";
}

function summarize({ supported, unsupported }) {
  const total = supported + unsupported;
  return Object.freeze({ supported, unsupported, total, percent: total === 0 ? 0 : Math.round((supported / total) * 1_000) / 10 });
}

function domainsRelated(left, right) { return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`); }

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Coverage hostname is required.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (hostname.length > 253 || !hostname.split(".").every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))) {
    throw new TypeError("Coverage hostname must be a valid hostname.");
  }
  return hostname;
}
