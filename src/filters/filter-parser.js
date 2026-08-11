import { createCosmeticControlFilter, createCosmeticFilter, createExceptionFilter, createNetworkFilter } from "./filter-model.js";
import { parseScriptletRule } from "../scriptlets/scriptlet-parser.js";
import { resolveRedirectResource } from "./redirect-resource-registry.js";

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN_PATTERN = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*`;
const HOST_ANCHORED_PATTERN = new RegExp(`^\\|\\|(${DOMAIN_PATTERN})\\^$`, "i");
const COSMETIC_RULE = /^([^#]*)(#@\?#|#\?#|##|#@#)(.+)$/;
export const FILTER_TEXT_LIMITS = Object.freeze({ sourceBytes: 5_000_000, lines: 250_000, lineCharacters: 8_192 });
const RESOURCE_OPTIONS = new Map([
  ["stylesheet", "stylesheet"], ["image", "image"], ["font", "font"],
  ["media", "media"], ["script", "script"], ["xmlhttprequest", "xmlhttprequest"],
  ["xhr", "xmlhttprequest"], ["subdocument", "sub_frame"], ["document", "main_frame"],
  ["ping", "ping"], ["websocket", "websocket"], ["other", "other"],
]);

export function parseFilterRule(source) {
  if (typeof source !== "string") throw new TypeError("Filter rule source must be a string.");
  if (source.length > FILTER_TEXT_LIMITS.lineCharacters) return unsupported("", "rule-too-long");
  const text = source.trim();
  if (text.length === 0 || text.startsWith("!") || /^\[.*\]$/.test(text)) return { status: "ignored", source: text };

  if (/(?:##|#@#)\+js\(/.test(text)) return parseScriptletRule(text);

  const cosmeticMatch = text.match(COSMETIC_RULE);
  if (cosmeticMatch) return parseCosmeticRule(text, cosmeticMatch);
  if (text.includes("##") || text.includes("#@#")) return unsupported(text, "cosmetic-syntax-not-supported");

  const exception = text.startsWith("@@");
  const networkText = exception ? text.slice(2) : text;
  const separator = networkText.indexOf("$");
  const rawPattern = separator === -1 ? networkText : networkText.slice(0, separator);
  const rawOptions = separator === -1 ? "" : networkText.slice(separator + 1);
  const pattern = normalizePattern(rawPattern);
  if (pattern === null) return unsupported(text, "pattern-not-supported");

  const options = parseOptions(rawOptions);
  if (!options.ok) return unsupported(text, options.reason, options.details);
  if (options.value.genericHide) {
    const host = pattern.match(HOST_ANCHORED_PATTERN)?.[1];
    if (!exception || !host || options.value.resourceTypes.length > 0 || options.value.domains.length > 0 || options.value.thirdParty !== null) {
      return unsupported(text, "invalid-generichide-rule");
    }
    return supported(text, createCosmeticControlFilter({ mode: "generichide", domains: [host] }));
  }
  const { genericHide, redirectResource, ...networkOptions } = options.value;
  const input = { pattern, ...networkOptions, ...(redirectResource ? { redirectResource } : {}) };
  try {
    return supported(text, exception ? createExceptionFilter(input) : createNetworkFilter(input));
  } catch (error) {
    return unsupported(text, "invalid-filter", error.message);
  }
}

function parseCosmeticRule(source, match) {
  const domains = [];
  const excludedDomains = [];
  for (const rawEntry of match[1] ? match[1].split(",") : []) {
    const entry = rawEntry.trim();
    const excluded = entry.startsWith("~");
    const domain = (excluded ? entry.slice(1) : entry).toLowerCase();
    if (!new RegExp(`^${DOMAIN_PATTERN}$`, "i").test(domain)) {
      return unsupported(source, "invalid-cosmetic-domain", rawEntry);
    }
    (excluded ? excludedDomains : domains).push(domain);
  }
  try {
    return supported(source, createCosmeticFilter({
      domains, excludedDomains, selector: match[3], exception: match[2] === "#@#" || match[2] === "#@?#",
    }));
  } catch (error) {
    return unsupported(source, "invalid-cosmetic-filter", error.message);
  }
}

export function parseFilterText(source) {
  if (typeof source !== "string") throw new TypeError("Filter text must be a string.");
  if (new TextEncoder().encode(source).length > FILTER_TEXT_LIMITS.sourceBytes) throw new RangeError("Filter text exceeds the source size limit.");
  const lines = source.split(/\r?\n/);
  if (lines.length > FILTER_TEXT_LIMITS.lines) throw new RangeError("Filter text exceeds the line count limit.");
  let sourceList = null;
  const results = lines.map((line, index) => {
    const marker = line.match(/^! OriginMatrix source:\s*(.+)$/);
    if (marker) sourceList = marker[1].trim().slice(0, 100);
    const result = parseFilterRule(line);
    const filter = result.status === "supported" ? validateWithAttribution(result.filter, result.source, sourceList) : result.filter;
    return Object.freeze({ ...result, ...(filter ? { filter } : {}), line: index + 1 });
  });
  const filters = results.filter(({ status }) => status === "supported").map(({ filter }) => filter);
  const ignored = results.filter(({ status }) => status === "ignored");
  const unsupportedRules = results.filter(({ status }) => status === "unsupported");
  return Object.freeze({
    filters: Object.freeze(filters),
    ignored: Object.freeze(ignored),
    unsupported: Object.freeze(unsupportedRules),
    diagnostics: Object.freeze({
      totalLines: lines.length,
      rulesParsed: filters.length + unsupportedRules.length,
      rulesSupported: filters.length,
      rulesUnsupported: unsupportedRules.length,
      rulesIgnored: ignored.length,
      rulesCompiled: 0,
      rulesOptimized: 0,
    }),
  });
}

function validateWithAttribution(filter, sourceRule, sourceList) {
  const input = { ...filter, sourceRule, ...(sourceList ? { sourceList } : {}) };
  if (filter.type === "network") return createNetworkFilter(input);
  if (filter.type === "exception") return createExceptionFilter(input);
  if (filter.type === "cosmetic") return createCosmeticFilter(input);
  if (filter.type === "cosmetic-control") return createCosmeticControlFilter(input);
  return filter.type === "scriptlet" ? Object.freeze({ ...filter, sourceRule, ...(sourceList ? { sourceList } : {}) }) : filter;
}

function parseOptions(source) {
  const value = { domains: [], excludedDomains: [], resourceTypes: [], thirdParty: null, genericHide: false, important: false, badfilter: false, redirectResource: null };
  if (source.length === 0) return { ok: true, value };
  const options = source.split(",");
  if (options.some((option) => option.length === 0)) return { ok: false, reason: "invalid-options" };

  for (const option of options) {
    const normalized = option.toLowerCase();
    if (RESOURCE_OPTIONS.has(normalized)) {
      value.resourceTypes.push(RESOURCE_OPTIONS.get(normalized));
    } else if (normalized === "third-party" || normalized === "~third-party") {
      const requested = normalized === "third-party";
      if (value.thirdParty !== null && value.thirdParty !== requested) {
        return { ok: false, reason: "conflicting-options", details: "third-party" };
      }
      value.thirdParty = requested;
    } else if (normalized.startsWith("domain=")) {
      const domainResult = parseDomainOption(option.slice("domain=".length));
      if (!domainResult.ok) return domainResult;
      value.domains.push(...domainResult.domains);
      value.excludedDomains.push(...domainResult.excludedDomains);
    } else if (normalized === "generichide") {
      value.genericHide = true;
    } else if (normalized === "important") {
      value.important = true;
    } else if (normalized === "badfilter") {
      value.badfilter = true;
    } else if (normalized.startsWith("redirect=")) {
      const redirect = resolveRedirectResource(option.slice("redirect=".length));
      if (!redirect) return { ok: false, reason: "unknown-redirect-resource", details: option.slice("redirect=".length) };
      value.redirectResource = redirect.name;
    } else {
      return { ok: false, reason: "unsupported-option", details: option };
    }
  }
  if (value.redirectResource && value.resourceTypes.length > 0) {
    const redirect = resolveRedirectResource(value.redirectResource);
    if (value.resourceTypes.some((type) => !redirect.resourceTypes.includes(type))) {
      return { ok: false, reason: "redirect-resource-type-mismatch", details: value.redirectResource };
    }
  }
  return { ok: true, value };
}

function parseDomainOption(source) {
  if (source.length === 0) return { ok: false, reason: "invalid-domain-option" };
  const domains = [];
  const excludedDomains = [];
  for (const entry of source.split("|")) {
    const excluded = entry.startsWith("~");
    const domain = (excluded ? entry.slice(1) : entry).toLowerCase();
    if (!new RegExp(`^${DOMAIN_PATTERN}$`, "i").test(domain)) {
      return { ok: false, reason: "invalid-domain-option", details: entry };
    }
    (excluded ? excludedDomains : domains).push(domain);
  }
  return { ok: true, domains, excludedDomains };
}

function normalizePattern(source) {
  if (source.length === 0 || /\s/.test(source) || looksLikeRegularExpression(source)) return null;
  if (source.includes("#") || source.includes("$")) return null;
  const hostMatch = source.match(HOST_ANCHORED_PATTERN);
  if (hostMatch) return `||${hostMatch[1].toLowerCase()}^`;
  if (source.startsWith("||")) {
    const anchored = source.slice(2).match(new RegExp(`^(${DOMAIN_PATTERN})(.*)$`, "i"));
    if (!anchored || anchored[2] && !/^[\^/*?]/.test(anchored[2])) return null;
    return `||${anchored[1].toLowerCase()}${anchored[2]}`;
  }
  return source;
}

function looksLikeRegularExpression(source) {
  return source.startsWith("/") && source.endsWith("/") && /[\\[\](){}+\\]/.test(source.slice(1, -1));
}

function supported(source, filter) {
  return Object.freeze({ status: "supported", source, filter });
}

function unsupported(source, reason, details) {
  return Object.freeze({ status: "unsupported", source, reason, ...(details ? { details } : {}) });
}
