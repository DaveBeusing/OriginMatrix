import { createCosmeticFilter, createExceptionFilter, createNetworkFilter } from "./filter-model.js";
import { parseScriptletRule } from "../scriptlets/scriptlet-parser.js";

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN_PATTERN = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*`;
const HOST_ANCHORED_PATTERN = new RegExp(`^\\|\\|(${DOMAIN_PATTERN})\\^$`, "i");
const COSMETIC_RULE = new RegExp(`^(${DOMAIN_PATTERN})##(.+)$`, "i");
const RESOURCE_OPTIONS = new Map([
  ["stylesheet", "stylesheet"], ["image", "image"], ["font", "font"],
  ["media", "media"], ["script", "script"], ["xmlhttprequest", "xmlhttprequest"],
  ["xhr", "xmlhttprequest"], ["subdocument", "sub_frame"], ["document", "main_frame"],
  ["ping", "ping"], ["websocket", "websocket"], ["other", "other"],
]);

export function parseFilterRule(source) {
  if (typeof source !== "string") throw new TypeError("Filter rule source must be a string.");
  const text = source.trim();
  if (text.length === 0 || text.startsWith("!") || /^\[.*\]$/.test(text)) return { status: "ignored", source: text };

  if (/(?:##|#@#)\+js\(/.test(text)) return parseScriptletRule(text);

  const cosmeticMatch = text.match(COSMETIC_RULE);
  if (cosmeticMatch && !cosmeticMatch[2].startsWith("+js(")) {
    return supported(text, createCosmeticFilter({ domains: [cosmeticMatch[1]], selector: cosmeticMatch[2] }));
  }
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
  const input = { pattern, ...options.value };
  try {
    return supported(text, exception ? createExceptionFilter(input) : createNetworkFilter(input));
  } catch (error) {
    return unsupported(text, "invalid-filter", error.message);
  }
}

export function parseFilterText(source) {
  if (typeof source !== "string") throw new TypeError("Filter text must be a string.");
  const lines = source.split(/\r?\n/);
  const results = lines.map((line, index) => Object.freeze({ ...parseFilterRule(line), line: index + 1 }));
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

function parseOptions(source) {
  const value = { domains: [], excludedDomains: [], resourceTypes: [], thirdParty: null };
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
    } else {
      return { ok: false, reason: "unsupported-option", details: option };
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
