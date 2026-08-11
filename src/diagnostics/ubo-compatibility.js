import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";
import { CosmeticParser } from "../cosmetic/cosmetic-parser.js";
import { ScriptletRegistry } from "../scriptlets/scriptlet-registry.js";

const CATEGORY_KEYS = Object.freeze(["network", "modifiers", "exceptions", "cosmetic", "procedural", "scriptlets", "redirects", "preprocessors", "unsupportedSyntax"]);
const SUPPORTED_MODIFIERS = new Set(["stylesheet", "image", "font", "media", "script", "xmlhttprequest", "xhr", "subdocument", "frame", "document", "doc", "ping", "websocket", "other", "third-party", "1p", "3p", "domain", "generichide", "important", "badfilter", "redirect", "removeparam", "denyallow", "to", "method", "match-case"]);
const PROCEDURAL = /:(contains|has-text|matches-css|matches-path|remove|style|upward|watch-attr|xpath)\s*\(/ig;
const SCRIPTLET = /(?:##|#@#)\+js\(\s*([^,\s)]+)|#%#\/\/scriptlet\(\s*["']([^"']+)/i;
const PREPROCESSOR = /^!#(if|else|endif|include)\b/i;
const HOSTNAME = /[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+/ig;
const cosmeticParser = new CosmeticParser();
const scriptletRegistry = new ScriptletRegistry();

export function analyzeUboCompatibility(sources, { hostname = "youtube.com" } = {}) {
  validateSources(sources);
  const site = normalizeHostname(hostname);
  const counters = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, { total: 0, supported: 0 }]));
  const siteCounters = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, { total: 0, supported: 0 }]));
  const unsupported = new Map();
  let total = 0;
  let supported = 0;
  let relevantTotal = 0;
  let relevantSupported = 0;

  for (const source of sources) {
    const seen = new Set();
    source.source.split(/\r?\n/).forEach((raw, index) => {
      const line = raw.trim();
      const directive = PREPROCESSOR.test(line);
      if (!line || (!directive && seen.has(line)) || (line.startsWith("!") && !directive) || /^\[.*\]$/.test(line)) return;
      if (!directive) seen.add(line);
      const analysis = analyzeRule(line);
      const relevant = isSiteRelevant(line, analysis.category, site);
      total += 1;
      supported += Number(analysis.supported);
      counters[analysis.category].total += 1;
      counters[analysis.category].supported += Number(analysis.supported);
      if (!analysis.supported) {
        counters.unsupportedSyntax.total += 1;
        recordIssues(unsupported, analysis.issues, { source, line, lineNumber: index + 1, relevant });
      }
      if (relevant) {
        relevantTotal += 1;
        relevantSupported += Number(analysis.supported);
        siteCounters[analysis.category].total += 1;
        siteCounters[analysis.category].supported += Number(analysis.supported);
        if (!analysis.supported) siteCounters.unsupportedSyntax.total += 1;
      }
      for (const modifier of analysis.modifiers) {
        counters.modifiers.total += 1;
        counters.modifiers.supported += Number(modifier.supported);
        if (relevant) {
          siteCounters.modifiers.total += 1;
          siteCounters.modifiers.supported += Number(modifier.supported);
        }
        if (!modifier.supported) recordIssues(unsupported, [modifier.name], { source, line, lineNumber: index + 1, relevant });
      }
    });
  }

  return Object.freeze({
    hostname: site,
    sources: Object.freeze(sources.map(({ name, version = "unknown" }) => Object.freeze({ name, version }))),
    overall: summarize({ total, supported }),
    categories: freezeSummaries(counters),
    siteRelevant: Object.freeze({ overall: summarize({ total: relevantTotal, supported: relevantSupported }), categories: freezeSummaries(siteCounters) }),
    unsupportedRanking: Object.freeze([...unsupported.values()].map((entry) => Object.freeze({
      primitive: entry.primitive, occurrences: entry.occurrences, youtubeRelevant: entry.youtubeRelevant,
      sourceLists: Object.freeze([...entry.sourceLists].sort()), affectedDomains: Object.freeze([...entry.affectedDomains].sort().slice(0, 50)),
      affectedDomainCount: entry.affectedDomains.size,
    })).sort((left, right) => right.youtubeRelevant - left.youtubeRelevant || right.occurrences - left.occurrences || left.primitive.localeCompare(right.primitive))),
  });
}

function analyzeRule(line) {
  const directive = line.match(PREPROCESSOR);
  if (directive) return { category: "preprocessors", supported: true, issues: [], modifiers: [] };
  if (/(?:##|#@#)\^/.test(line)) return { category: "cosmetic", supported: false, issues: ["html-filtering"], modifiers: [] };
  const scriptlet = line.match(SCRIPTLET);
  const category = scriptlet ? "scriptlets" : classifyPrimary(line);
  const parsed = parseFilterRule(line);
  let supported = parsed.status === "supported";
  let reason = parsed.reason ?? "unsupported-syntax";
  if (supported && [FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(parsed.filter.type)) {
    const validation = cosmeticParser.parseModels([parsed.filter]);
    if (validation.unsupported.length) { supported = false; reason = validation.unsupported[0].reason; }
  }
  if (supported && parsed.filter.type === FILTER_TYPE.SCRIPTLET) {
    try { scriptletRegistry.createInvocation(parsed.filter.name, parsed.filter.args); }
    catch (error) { supported = false; reason = error.message; }
  }
  const modifiers = extractModifiers(line).map((name) => Object.freeze({ name, supported: SUPPORTED_MODIFIERS.has(name) }));
  const issues = supported ? [] : issueNames({ line, category, scriptlet, reason, modifiers });
  return { category, supported, issues, modifiers };
}

function classifyPrimary(line) {
  if (/\$(?:[^,]*,)*(?:redirect(?:-rule)?)(?:=|,|$)/i.test(line)) return "redirects";
  if (/(?:#\?#|#@\?#)/.test(line) || PROCEDURAL.test(line)) { PROCEDURAL.lastIndex = 0; return "procedural"; }
  PROCEDURAL.lastIndex = 0;
  if (/(?:##|#@#|#\$#|#\^)/.test(line)) return "cosmetic";
  return line.startsWith("@@") ? "exceptions" : "network";
}

function extractModifiers(line) {
  if (/(?:##|#@#|#\?#|#@\?#|#%#)/.test(line)) return [];
  const separator = line.indexOf("$");
  if (separator < 0) return [];
  return line.slice(separator + 1).split(",").filter(Boolean).map((option) => option.trim().toLowerCase().replace(/^~/, "").split("=")[0]);
}

function issueNames({ line, category, scriptlet, reason, modifiers }) {
  const unsupportedModifiers = modifiers.filter((item) => !item.supported).map(({ name }) => name);
  if (unsupportedModifiers.length) return [];
  if (category === "scriptlets") return [(scriptlet?.[1] ?? scriptlet?.[2] ?? "scriptlet").toLowerCase().replace(/\.js$/, "")];
  if (category === "procedural") {
    const names = lineOperators(line);
    if (names.length) return names;
  }
  return [reason];
}

function lineOperators(line) { return [...line.matchAll(PROCEDURAL)].map((match) => `:${match[1].toLowerCase()}`); }

function recordIssues(target, issues, { source, line, relevant }) {
  const domains = mentionedHostnames(line);
  for (const primitive of new Set(issues)) {
    const entry = target.get(primitive) ?? { primitive, occurrences: 0, youtubeRelevant: 0, sourceLists: new Set(), affectedDomains: new Set() };
    entry.occurrences += 1;
    entry.youtubeRelevant += Number(relevant);
    entry.sourceLists.add(source.name);
    for (const domain of domains) entry.affectedDomains.add(domain);
    target.set(primitive, entry);
  }
}

function isSiteRelevant(line, category, hostname) {
  const domains = mentionedHostnames(line);
  return domains.some((domain) => related(hostname, domain));
}

function mentionedHostnames(line) { return [...new Set(line.toLowerCase().match(HOSTNAME) ?? [])]; }
function related(left, right) { return left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`); }
function summarize({ total, supported }) { return Object.freeze({ total, supported, unsupported: total - supported, percent: total === 0 ? 0 : Math.round((supported / total) * 1_000) / 10 }); }
function freezeSummaries(counters) { return Object.freeze(Object.fromEntries(CATEGORY_KEYS.map((key) => [key, summarize(counters[key])]))); }
function validateSources(sources) { if (!Array.isArray(sources) || sources.some((item) => !item || typeof item.name !== "string" || !item.name || typeof item.source !== "string")) throw new TypeError("uBO compatibility sources must contain names and filter text."); }
function normalizeHostname(value) { if (typeof value !== "string" || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(value.trim()) || value.includes("..")) throw new TypeError("A valid compatibility hostname is required."); return value.trim().toLowerCase(); }
