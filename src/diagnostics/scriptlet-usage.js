import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";
import { ScriptletRegistry } from "../scriptlets/scriptlet-registry.js";

const SCRIPTLET_NAME_PATTERNS = [
  /(?:##|#@#)\+js\(\s*([^,\s)]+)/i,
  /#%#\/\/scriptlet\(\s*["']([^"']+)["']/i,
];

export function analyzeScriptletUsage(source, { relevantDomains = [], registry = new ScriptletRegistry() } = {}) {
  if (typeof source !== "string") throw new TypeError("Scriptlet usage source must be filter text.");
  const domains = relevantDomains.map(normalizeHostname);
  const usage = new Map();
  let totalReferences = 0;
  let relevantReferences = 0;

  source.split(/\r?\n/).forEach((line, index) => {
    const name = extractScriptletName(line);
    if (!name) return;
    totalReferences += 1;
    const relevant = domains.length > 0 && mentionedHostnames(line).some((candidate) => domains.some((domain) => domainsRelated(domain, candidate)));
    if (relevant) relevantReferences += 1;
    const support = evaluateSupport(line, registry);
    const entry = usage.get(name) ?? { name, total: 0, relevant: 0, supported: 0, unsupported: 0, reasons: new Map(), samples: [] };
    entry.total += 1;
    entry.relevant += Number(relevant);
    entry[support.supported ? "supported" : "unsupported"] += 1;
    if (!support.supported) entry.reasons.set(support.reason, (entry.reasons.get(support.reason) ?? 0) + 1);
    if (entry.samples.length < 3) entry.samples.push(Object.freeze({ line: index + 1, relevant, supported: support.supported, reason: support.reason, source: line.slice(0, 300) }));
    usage.set(name, entry);
  });

  const names = [...usage.values()].sort((left, right) => right.relevant - left.relevant || right.total - left.total || left.name.localeCompare(right.name));
  return Object.freeze({
    totalReferences,
    relevantReferences,
    relevantDomains: Object.freeze([...domains]),
    names: Object.freeze(names.map((entry) => Object.freeze({
      ...entry,
      reasons: Object.freeze(Object.fromEntries([...entry.reasons].sort(([left], [right]) => left.localeCompare(right)))),
      samples: Object.freeze(entry.samples),
    }))),
  });
}

function evaluateSupport(source, registry) {
  const parsed = parseFilterRule(source);
  if (parsed.status !== "supported" || parsed.filter.type !== FILTER_TYPE.SCRIPTLET) {
    return { supported: false, reason: parsed.reason ?? "scriptlet-syntax-not-supported" };
  }
  try { registry.createInvocation(parsed.filter.name, parsed.filter.args); return { supported: true, reason: null }; }
  catch (error) { return { supported: false, reason: error.message };
  }
}

function extractScriptletName(source) {
  for (const pattern of SCRIPTLET_NAME_PATTERNS) {
    const match = source.match(pattern);
    if (match) return match[1].trim().toLowerCase().replace(/\.js$/, "");
  }
  return null;
}

function mentionedHostnames(source) {
  return source.toLowerCase().match(/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/g) ?? [];
}

function domainsRelated(left, right) { return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`); }

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Relevant domains must be hostnames.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes(":") || hostname.includes("/")) throw new TypeError("Relevant domains must be hostnames.");
  return hostname;
}
