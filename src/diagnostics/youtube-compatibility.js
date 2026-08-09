import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";
import { CosmeticParser } from "../cosmetic/cosmetic-parser.js";
import { ScriptletRegistry } from "../scriptlets/scriptlet-registry.js";

const YOUTUBE_TARGET = /(?:youtube(?:-nocookie)?\.com|youtubei\.googleapis\.com|googlevideo\.com|ytimg\.com|googleads\.g\.doubleclick\.net)/i;
const MAX_SAMPLES = 20;
const cosmeticParser = new CosmeticParser();
const scriptletRegistry = new ScriptletRegistry();

export function analyzeYouTubeCompatibility(source, { listVersion = "unknown" } = {}) {
  if (typeof source !== "string") throw new TypeError("YouTube diagnostic source must be filter text.");
  const counts = {
    relevantRules: 0,
    supportedNetwork: 0,
    supportedExceptions: 0,
    supportedCosmetic: 0,
    supportedScriptlet: 0,
    unsupportedNetwork: 0,
    unsupportedCosmetic: 0,
    unsupportedScriptlet: 0,
  };
  const reasons = new Map();
  const samples = [];
  source.split(/\r?\n/).forEach((line, index) => {
    if (!YOUTUBE_TARGET.test(line)) return;
    const parsed = parseFilterRule(line);
    if (parsed.status === "ignored") return;
    counts.relevantRules += 1;
    if (parsed.status === "supported") {
      const validationReason = engineValidationReason(parsed.filter);
      if (validationReason) {
        const category = supportedCategory(parsed.filter);
        counts[`unsupported${capitalize(category)}`] += 1;
        reasons.set(validationReason, (reasons.get(validationReason) ?? 0) + 1);
        if (samples.length < MAX_SAMPLES) samples.push(Object.freeze({ line: index + 1, category, reason: validationReason, source: line.slice(0, 300) }));
        return;
      }
      if (parsed.filter.type === FILTER_TYPE.NETWORK) counts.supportedNetwork += 1;
      else if (parsed.filter.type === FILTER_TYPE.EXCEPTION) counts.supportedExceptions += 1;
      else if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(parsed.filter.type)) counts.supportedCosmetic += 1;
      else if (parsed.filter.type === FILTER_TYPE.SCRIPTLET) counts.supportedScriptlet += 1;
      return;
    }
    const category = unsupportedCategory(line);
    counts[`unsupported${capitalize(category)}`] += 1;
    reasons.set(parsed.reason, (reasons.get(parsed.reason) ?? 0) + 1);
    if (samples.length < MAX_SAMPLES) {
      samples.push(Object.freeze({ line: index + 1, category, reason: parsed.reason, source: line.slice(0, 300) }));
    }
  });

  const supportedRules = counts.supportedNetwork + counts.supportedExceptions + counts.supportedCosmetic + counts.supportedScriptlet;
  const unsupportedRules = counts.unsupportedNetwork + counts.unsupportedCosmetic + counts.unsupportedScriptlet;
  return Object.freeze({
    listVersion,
    ...counts,
    supportedRules,
    unsupportedRules,
    supportPercent: counts.relevantRules === 0 ? 0 : Math.round((supportedRules / counts.relevantRules) * 1_000) / 10,
    unsupportedReasons: Object.freeze(Object.fromEntries([...reasons].sort(([left], [right]) => left.localeCompare(right)))),
    samples: Object.freeze(samples),
    capabilities: Object.freeze({ network: true, cosmetic: true, proceduralCosmetic: true, genericHideExceptions: true, scriptlets: true, runtimePlaybackVerification: true, advertisingTelemetry: true }),
  });
}

function engineValidationReason(filter) {
  if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(filter.type)) return cosmeticParser.parseModels([filter]).unsupported[0]?.reason ?? null;
  if (filter.type === FILTER_TYPE.SCRIPTLET) {
    try { scriptletRegistry.createInvocation(filter.name, filter.args); }
    catch (error) { return error.message; }
  }
  return null;
}
function supportedCategory(filter) {
  if ([FILTER_TYPE.COSMETIC, FILTER_TYPE.COSMETIC_CONTROL].includes(filter.type)) return "cosmetic";
  if (filter.type === FILTER_TYPE.SCRIPTLET) return "scriptlet";
  return "network";
}

function unsupportedCategory(source) {
  if (/(?:##|#@#|#%#)\+js\(/i.test(source) || /#%#/.test(source)) return "scriptlet";
  if (/(?:##|#@#|#\?#|#\$#)/.test(source)) return "cosmetic";
  return "network";
}

function capitalize(value) { return value[0].toUpperCase() + value.slice(1); }
