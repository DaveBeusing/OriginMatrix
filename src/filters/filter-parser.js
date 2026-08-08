import { createCosmeticFilter, createExceptionFilter, createNetworkFilter } from "./filter-model.js";

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]*[a-z0-9])?";
const DOMAIN_PATTERN = `${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*`;
const NETWORK_RULE = new RegExp(`^(@@)?\\|\\|(${DOMAIN_PATTERN})\\^$`, "i");
const COSMETIC_RULE = new RegExp(`^(${DOMAIN_PATTERN})##(.+)$`, "i");

export function parseFilterRule(source) {
  if (typeof source !== "string") throw new TypeError("Filter rule source must be a string.");
  const text = source.trim();
  if (text.length === 0 || text.startsWith("!") || /^\[.*\]$/.test(text)) return { status: "ignored", source: text };

  const networkMatch = text.match(NETWORK_RULE);
  if (networkMatch) {
    const input = { pattern: `||${networkMatch[2].toLowerCase()}^` };
    return { status: "supported", source: text, filter: networkMatch[1] ? createExceptionFilter(input) : createNetworkFilter(input) };
  }

  const cosmeticMatch = text.match(COSMETIC_RULE);
  if (cosmeticMatch && !cosmeticMatch[2].startsWith("+js(")) {
    return {
      status: "supported",
      source: text,
      filter: createCosmeticFilter({ domains: [cosmeticMatch[1]], selector: cosmeticMatch[2] }),
    };
  }

  return { status: "unsupported", source: text, reason: "syntax-not-supported" };
}

export function parseFilterText(source) {
  if (typeof source !== "string") throw new TypeError("Filter text must be a string.");
  const results = source.split(/\r?\n/).map(parseFilterRule);
  return Object.freeze({
    filters: Object.freeze(results.filter(({ status }) => status === "supported").map(({ filter }) => filter)),
    ignored: Object.freeze(results.filter(({ status }) => status === "ignored")),
    unsupported: Object.freeze(results.filter(({ status }) => status === "unsupported")),
  });
}
