export const FILTER_TYPE = Object.freeze({
  NETWORK: "network",
  COSMETIC: "cosmetic",
  EXCEPTION: "exception",
  SCRIPTLET: "scriptlet",
});

export const FILTER_ACTION = Object.freeze({ BLOCK: "block", ALLOW: "allow" });

const NETWORK_RESOURCE_TYPES = new Set([
  "stylesheet", "image", "font", "media", "script", "xmlhttprequest",
  "sub_frame", "main_frame", "ping", "websocket", "other",
]);

export function createNetworkFilter(input) {
  return createNetworkLikeFilter(input, FILTER_TYPE.NETWORK, FILTER_ACTION.BLOCK);
}

export function createExceptionFilter(input) {
  return createNetworkLikeFilter(input, FILTER_TYPE.EXCEPTION, FILTER_ACTION.ALLOW);
}

export function createCosmeticFilter(input) {
  const selector = requiredText(input?.selector, "Cosmetic selector");
  if (input?.exception !== undefined && typeof input.exception !== "boolean") {
    throw new TypeError("Cosmetic exception must be a boolean.");
  }
  return freezeFilter({
    type: FILTER_TYPE.COSMETIC,
    selector,
    domains: normalizeDomains(input.domains),
    excludedDomains: normalizeDomains(input.excludedDomains),
    ...(input.exception === true ? { exception: true } : {}),
  });
}

export function createScriptletFilter(input) {
  const name = requiredText(input?.name, "Scriptlet name");
  if (!/^[a-z][a-z0-9-]*$/i.test(name)) throw new TypeError("Scriptlet name is invalid.");
  const args = input.args ?? [];
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== "string")) {
    throw new TypeError("Scriptlet arguments must be strings.");
  }
  return freezeFilter({
    type: FILTER_TYPE.SCRIPTLET,
    name,
    args: [...args],
    domains: normalizeDomains(input.domains),
    excludedDomains: normalizeDomains(input.excludedDomains),
  });
}

export function validateFilter(filter) {
  switch (filter?.type) {
    case FILTER_TYPE.NETWORK: return createNetworkFilter(filter);
    case FILTER_TYPE.EXCEPTION: return createExceptionFilter(filter);
    case FILTER_TYPE.COSMETIC: return createCosmeticFilter(filter);
    case FILTER_TYPE.SCRIPTLET: return createScriptletFilter(filter);
    default: throw new TypeError(`Unsupported filter type: ${filter?.type}`);
  }
}

function createNetworkLikeFilter(input, type, action) {
  const pattern = requiredText(input?.pattern, "Network pattern");
  const thirdParty = input.thirdParty ?? null;
  if (![true, false, null].includes(thirdParty)) throw new TypeError("thirdParty must be true, false, or null.");
  const resourceTypes = normalizeStrings(input.resourceTypes, "resourceTypes");
  for (const resourceType of resourceTypes) {
    if (!NETWORK_RESOURCE_TYPES.has(resourceType)) throw new TypeError(`Unsupported filter resource type: ${resourceType}`);
  }
  return freezeFilter({
    type,
    pattern,
    domains: normalizeDomains(input.domains),
    excludedDomains: normalizeDomains(input.excludedDomains),
    resourceTypes,
    thirdParty,
    action,
  });
}

function normalizeDomains(values = []) {
  const domains = normalizeStrings(values, "domains").map((domain) => domain.toLowerCase().replace(/^\.+|\.+$/g, ""));
  if (domains.some((domain) => !isHostname(domain))) throw new TypeError("Filter domains must be hostnames.");
  return [...new Set(domains)].sort();
}

function normalizeStrings(values = [], field) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || value.trim().length === 0)) {
    throw new TypeError(`${field} must contain non-empty strings.`);
  }
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) throw new TypeError(`${field} is required.`);
  return value.trim();
}

function isHostname(value) {
  return value.length <= 253 && value.split(".").every((label) => (
    label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ));
}

function freezeFilter(filter) {
  for (const value of Object.values(filter)) if (Array.isArray(value)) Object.freeze(value);
  return Object.freeze(filter);
}
