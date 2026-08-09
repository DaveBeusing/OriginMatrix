import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";
import { ScriptletRegistry } from "../scriptlets/scriptlet-registry.js";

const SCRIPTLET_NAME_PATTERNS = [
  /(?:##|#@#)\+js\(\s*([^,\s)]+)/i,
  /#%#\/\/scriptlet\(\s*["']([^"']+)["']/i,
];

export function analyzeRelevantScriptletCoverage(sources, { hostname, registry = new ScriptletRegistry() } = {}) {
  if (!Array.isArray(sources) || sources.some((item) => !item || typeof item.name !== "string" || typeof item.source !== "string")) {
    throw new TypeError("Scriptlet coverage sources must contain names and filter text.");
  }
  const site = normalizeHostname(hostname);
  const occurrences = [];
  const seen = new Set();

  for (const source of sources) {
    source.source.split(/\r?\n/).forEach((line, index) => {
      const extractedName = extractScriptletName(line);
      if (!extractedName) return;
      const rule = line.trim();
      const duplicateKey = `${source.name}\u0000${rule}`;
      if (seen.has(duplicateKey)) return;
      seen.add(duplicateKey);
      const scope = scriptletScope(rule);
      const relevant = scopeApplies(scope, site);
      const support = evaluateSupport(rule, registry);
      const name = support.name ?? extractedName;
      occurrences.push(Object.freeze({
        name, sourceList: source.name, line: index + 1,
        relevantDomains: Object.freeze(scope.included.length ? scope.included : ["*"]),
        excludedDomains: Object.freeze(scope.excluded), relevant,
        supported: support.supported, phase: support.phase ?? null,
        reason: support.reason, source: rule.slice(0, 300),
      }));
    });
  }

  const byName = new Map();
  for (const occurrence of occurrences) {
    const entry = byName.get(occurrence.name) ?? { name: occurrence.name, occurrences: 0, relevantOccurrences: 0, supported: 0, unsupported: 0, relevantSupported: 0, relevantUnsupported: 0, phases: new Set(), sourceLists: new Set(), relevantDomains: new Set() };
    entry.occurrences += 1;
    entry.relevantOccurrences += Number(occurrence.relevant);
    entry[occurrence.supported ? "supported" : "unsupported"] += 1;
    if (occurrence.relevant) entry[occurrence.supported ? "relevantSupported" : "relevantUnsupported"] += 1;
    if (occurrence.phase) entry.phases.add(occurrence.phase);
    entry.sourceLists.add(occurrence.sourceList);
    for (const domain of occurrence.relevantDomains) entry.relevantDomains.add(domain);
    byName.set(occurrence.name, entry);
  }
  const primitives = [...byName.values()].map((entry) => Object.freeze({
    name: entry.name, occurrences: entry.occurrences, relevantOccurrences: entry.relevantOccurrences,
    supported: entry.supported, unsupported: entry.unsupported,
    relevantSupported: entry.relevantSupported, relevantUnsupported: entry.relevantUnsupported,
    executionPhases: Object.freeze([...entry.phases].sort()),
    sourceLists: Object.freeze([...entry.sourceLists].sort()),
    relevantDomains: Object.freeze([...entry.relevantDomains].sort()),
  })).sort((left, right) => right.relevantOccurrences - left.relevantOccurrences || right.occurrences - left.occurrences || left.name.localeCompare(right.name));
  const relevant = summarizeOccurrences(occurrences.filter((item) => item.relevant));
  const overall = summarizeOccurrences(occurrences);
  const unsupportedRanking = primitives.filter((item) => item.unsupported > 0).map((item) => Object.freeze({
    name: item.name,
    score: item.relevantUnsupported * 1_000 + item.unsupported * 10 + item.sourceLists.length,
    occurrences: item.occurrences,
    relevantUnsupported: item.relevantUnsupported,
    sourceLists: item.sourceLists,
    relevantDomains: item.relevantDomains,
  })).sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));

  return Object.freeze({ hostname: site, overall, relevant, primitives: Object.freeze(primitives), unsupportedRanking: Object.freeze(unsupportedRanking), occurrences: Object.freeze(occurrences) });
}

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
  try { const invocation = registry.createInvocation(parsed.filter.name, parsed.filter.args); return { supported: true, reason: null, name: invocation.name, phase: invocation.phase }; }
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

function scriptletScope(source) {
  const marker = source.search(/(?:##|#@#)\+js\(|#%#\/\/scriptlet\(/i);
  if (marker < 0) return { included: [], excluded: [] };
  const included = [];
  const excluded = [];
  for (const raw of source.slice(0, marker).split(",")) {
    const value = raw.trim().toLowerCase();
    if (!value) continue;
    const target = value.startsWith("~") ? excluded : included;
    const domain = value.replace(/^~/, "");
    if (/^[a-z0-9.-]+$/.test(domain)) target.push(domain);
  }
  return { included: [...new Set(included)].sort(), excluded: [...new Set(excluded)].sort() };
}

function scopeApplies(scope, hostname) {
  if (scope.excluded.some((domain) => hostnameMatches(hostname, domain))) return false;
  return scope.included.length === 0 || scope.included.some((domain) => hostnameMatches(hostname, domain));
}

function hostnameMatches(hostname, domain) { return hostname === domain || hostname.endsWith(`.${domain}`); }

function summarizeOccurrences(occurrences) {
  const supported = occurrences.filter((item) => item.supported).length;
  const total = occurrences.length;
  return Object.freeze({ total, supported, unsupported: total - supported, percent: total === 0 ? 0 : Math.round((supported / total) * 1_000) / 10 });
}

function normalizeHostname(value) {
  if (typeof value !== "string") throw new TypeError("Relevant domains must be hostnames.");
  const hostname = value.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes(":") || hostname.includes("/")) throw new TypeError("Relevant domains must be hostnames.");
  return hostname;
}
