import { WILDCARD } from "../shared/models.js";

export function normalizeHostname(value) {
  if (value === WILDCARD) return WILDCARD;
  const candidate = value.includes("://") ? new URL(value).hostname : value;
  const hostname = candidate.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
  if (!hostname || hostname.includes("/") || hostname.includes(":")) throw new TypeError(`Invalid hostname: ${value}`);
  return hostname;
}

export function domainMatches(hostname, policyDomain) {
  return policyDomain === WILDCARD || hostname === policyDomain || hostname.endsWith(`.${policyDomain}`);
}
