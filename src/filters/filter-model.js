export const FILTER_TYPE = Object.freeze({
  NETWORK: "network",
  COSMETIC: "cosmetic",
  EXCEPTION: "exception",
  SCRIPTLET: "scriptlet",
  COSMETIC_CONTROL: "cosmetic-control",
});

export const FILTER_ACTION = Object.freeze({ BLOCK: "block", ALLOW: "allow", REDIRECT: "redirect" });

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
    ...attribution(input),
  });
}

export function createCosmeticControlFilter(input) {
  if (input?.mode !== "generichide") throw new TypeError("Unsupported cosmetic control mode.");
  const domains = normalizeDomains(input.domains);
  if (domains.length === 0) throw new TypeError("Cosmetic controls require a hostname.");
  return freezeFilter({ type: FILTER_TYPE.COSMETIC_CONTROL, mode: input.mode, domains, excludedDomains: normalizeDomains(input.excludedDomains), ...attribution(input) });
}

export function createScriptletFilter(input) {
  const name = requiredText(input?.name, "Scriptlet name");
  if (!/^[a-z][a-z0-9-]*(?:\.js)?$/i.test(name)) throw new TypeError("Scriptlet name is invalid.");
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
    ...attribution(input),
  });
}

export function validateFilter(filter) {
  switch (filter?.type) {
    case FILTER_TYPE.NETWORK: return createNetworkFilter(filter);
    case FILTER_TYPE.EXCEPTION: return createExceptionFilter(filter);
    case FILTER_TYPE.COSMETIC: return createCosmeticFilter(filter);
    case FILTER_TYPE.SCRIPTLET: return createScriptletFilter(filter);
    case FILTER_TYPE.COSMETIC_CONTROL: return createCosmeticControlFilter(filter);
    default: throw new TypeError(`Unsupported filter type: ${filter?.type}`);
  }
}

function createNetworkLikeFilter(input, type, action) {
  const pattern = requiredText(input?.pattern, "Network pattern");
  if (input?.important !== undefined && typeof input.important !== "boolean") throw new TypeError("important must be a boolean.");
  if (input?.badfilter !== undefined && typeof input.badfilter !== "boolean") throw new TypeError("badfilter must be a boolean.");
  const thirdParty = input.thirdParty ?? null;
  if (![true, false, null].includes(thirdParty)) throw new TypeError("thirdParty must be true, false, or null.");
  const resourceTypes = normalizeStrings(input.resourceTypes, "resourceTypes");
  for (const resourceType of resourceTypes) {
    if (!NETWORK_RESOURCE_TYPES.has(resourceType)) throw new TypeError(`Unsupported filter resource type: ${resourceType}`);
  }
  const redirectResource = input.redirectResource;
  if (redirectResource !== undefined && (type !== FILTER_TYPE.NETWORK || typeof redirectResource !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(redirectResource))) {
    throw new TypeError("Redirect resource is invalid.");
  }
  return freezeFilter({
    type,
    pattern,
    domains: normalizeDomains(input.domains),
    excludedDomains: normalizeDomains(input.excludedDomains),
    resourceTypes,
    thirdParty,
    action: redirectResource ? FILTER_ACTION.REDIRECT : action,
    ...(redirectResource ? { redirectResource } : {}),
    ...(input.important === true ? { important: true } : {}),
    ...(input.badfilter === true ? { badfilter: true } : {}),
    ...attribution(input),
  });
}

function attribution(input) {
  const result = {};
  if (input?.sourceList !== undefined) result.sourceList = requiredText(input.sourceList, "Filter source list").slice(0, 100);
  if (input?.sourceRule !== undefined) result.sourceRule = requiredText(input.sourceRule, "Filter source rule").slice(0, 8_192);
  return result;
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
