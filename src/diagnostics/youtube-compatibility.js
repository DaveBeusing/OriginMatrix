import { FILTER_TYPE } from "../filters/filter-model.js";
import { parseFilterRule } from "../filters/filter-parser.js";

const YOUTUBE_TARGET = /(?:youtube(?:-nocookie)?\.com|youtubei\.googleapis\.com|googlevideo\.com|ytimg\.com|googleads\.g\.doubleclick\.net)/i;
const MAX_SAMPLES = 20;

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
      if (parsed.filter.type === FILTER_TYPE.NETWORK) counts.supportedNetwork += 1;
      else if (parsed.filter.type === FILTER_TYPE.EXCEPTION) counts.supportedExceptions += 1;
      else if (parsed.filter.type === FILTER_TYPE.COSMETIC) counts.supportedCosmetic += 1;
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
    capabilities: Object.freeze({ network: true, cosmetic: true, scriptlets: true, runtimePlaybackVerification: false }),
  });
}

function unsupportedCategory(source) {
  if (/(?:##|#@#|#%#)\+js\(/i.test(source) || /#%#/.test(source)) return "scriptlet";
  if (/(?:##|#@#|#\?#|#\$#)/.test(source)) return "cosmetic";
  return "network";
}

function capitalize(value) { return value[0].toUpperCase() + value.slice(1); }
