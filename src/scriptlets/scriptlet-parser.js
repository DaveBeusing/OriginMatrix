import { createScriptletFilter } from "../filters/filter-model.js";

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN = new RegExp(`^${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*$`, "i");
const ALIASES = new Map([
  ["remove-node-text.js", "remove-node-text"],
  ["set-constant.js", "set-constant"],
  ["abort-on-property-read.js", "abort-on-property-read"],
  ["aopr", "abort-on-property-read"],
]);
const MAX_ARGUMENT_LENGTH = 512;
const MAX_ARGUMENT_BYTES = 1_024;

export function parseScriptletRule(source) {
  if (typeof source !== "string") throw new TypeError("Scriptlet rule source must be a string.");
  const text = source.trim();
  if (text.includes("#@#+js(")) return unsupported(text, "scriptlet-exception-not-supported");
  const marker = "##+js(";
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return unsupported(text, "scriptlet-syntax-not-supported");
  if (!text.endsWith(")") || text.indexOf(marker, markerIndex + marker.length) !== -1) {
    return unsupported(text, "invalid-scriptlet-call");
  }

  const domainResult = parseDomains(text.slice(0, markerIndex));
  if (!domainResult.ok) return unsupported(text, domainResult.reason, domainResult.details);
  const argumentResult = parseArguments(text.slice(markerIndex + marker.length, -1));
  if (!argumentResult.ok) return unsupported(text, argumentResult.reason, argumentResult.details);
  const [rawName, ...args] = argumentResult.values;
  if (!rawName || !/^[a-z][a-z0-9.-]*$/i.test(rawName)) return unsupported(text, "invalid-scriptlet-name");
  const name = ALIASES.get(rawName.toLowerCase()) ?? rawName.toLowerCase();
  try {
    return Object.freeze({
      status: "supported",
      source: text,
      filter: createScriptletFilter({ name, args, domains: domainResult.domains, excludedDomains: domainResult.excludedDomains }),
    });
  } catch (error) {
    return unsupported(text, "invalid-scriptlet-filter", error.message);
  }
}

function parseDomains(source) {
  if (!source) return { ok: false, reason: "global-scriptlet-not-supported" };
  const domains = [];
  const excludedDomains = [];
  for (const rawEntry of source.split(",")) {
    const entry = rawEntry.trim();
    const excluded = entry.startsWith("~");
    const domain = (excluded ? entry.slice(1) : entry).toLowerCase();
    if (!DOMAIN.test(domain)) return { ok: false, reason: "invalid-scriptlet-domain", details: rawEntry };
    (excluded ? excludedDomains : domains).push(domain);
  }
  if (domains.length === 0) return { ok: false, reason: "global-scriptlet-not-supported" };
  return { ok: true, domains, excludedDomains };
}

function parseArguments(source) {
  const values = [];
  let value = "";
  let quote = null;
  let escaped = false;
  let quotedToken = false;
  let quoteClosed = false;
  for (const character of source) {
    if (escaped) {
      if (!["\\", ",", "'", '"'].includes(character)) return { ok: false, reason: "invalid-scriptlet-escape", details: `\\${character}` };
      value += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (quote) {
      if (character === quote) { quote = null; quoteClosed = true; }
      else value += character;
    } else if (character === "'" || character === '"') {
      if (value.trim().length > 0) return { ok: false, reason: "invalid-scriptlet-arguments" };
      quote = character;
      quotedToken = true;
      value = "";
    } else if (character === ",") {
      values.push(quotedToken ? value : value.trim());
      value = "";
      quotedToken = false;
      quoteClosed = false;
    } else if (quoteClosed) {
      if (!/\s/.test(character)) return { ok: false, reason: "invalid-scriptlet-arguments" };
    } else {
      value += character;
    }
  }
  if (escaped || quote) return { ok: false, reason: "unterminated-scriptlet-argument" };
  values.push(quotedToken ? value : value.trim());
  if (values.length > 9) return { ok: false, reason: "too-many-scriptlet-arguments" };
  if (values.some((item) => item.length > MAX_ARGUMENT_LENGTH)
    || new TextEncoder().encode(values.join("\u0000")).length > MAX_ARGUMENT_BYTES) {
    return { ok: false, reason: "scriptlet-arguments-too-large" };
  }
  return { ok: true, values };
}

function unsupported(source, reason, details) {
  return Object.freeze({ status: "unsupported", source, reason, ...(details ? { details } : {}) });
}
