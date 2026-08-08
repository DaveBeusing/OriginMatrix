export const SCHEMA_VERSION = 1;
export const WILDCARD = "*";

export const POLICY_ACTION = Object.freeze({ ALLOW: "allow", BLOCK: "block", INHERIT: "inherit" });
export const PARTY = Object.freeze({ ANY: "any", FIRST_PARTY: "firstParty", THIRD_PARTY: "thirdParty" });
export const RESOURCE_TYPE = Object.freeze({
  ALL: "all",
  STYLESHEET: "stylesheet",
  IMAGE: "image",
  MEDIA: "media",
  SCRIPT: "script",
  XHR: "xmlhttprequest",
  FRAME: "sub_frame",
  FONT: "font",
  WEBSOCKET: "websocket",
});

const ACTIONS = new Set(Object.values(POLICY_ACTION));
const PARTIES = new Set(Object.values(PARTY));
const RESOURCE_TYPES = new Set(Object.values(RESOURCE_TYPE));

export function createPolicy(input) {
  const policy = {
    scope: normalizePolicyDomain(input.scope ?? WILDCARD),
    target: normalizePolicyDomain(input.target ?? WILDCARD),
    party: input.party ?? PARTY.ANY,
    resourceType: input.resourceType ?? RESOURCE_TYPE.ALL,
    action: input.action,
    temporary: input.temporary === true,
    ...(input.tabId === undefined ? {} : { tabId: input.tabId }),
  };
  policy.id = input.id ?? policyIdentity(policy);
  validatePolicy(policy);
  if (policy.id !== policyIdentity(policy)) throw new TypeError("Policy id does not match its canonical identity.");
  return Object.freeze(policy);
}

export function createThirdPartyScriptPolicy({ site, tabId }) {
  return createPolicy({
    scope: site,
    party: PARTY.THIRD_PARTY,
    resourceType: RESOURCE_TYPE.SCRIPT,
    action: POLICY_ACTION.BLOCK,
    temporary: true,
    tabId,
  });
}

export function validatePolicy(policy, { allowInherit = true } = {}) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) throw new TypeError("Policy must be an object.");
  if (typeof policy.id !== "string" || policy.id.length === 0) throw new TypeError("Policy id is required.");
  validateDomain(policy.scope, "scope");
  validateDomain(policy.target, "target");
  if (!PARTIES.has(policy.party)) throw new TypeError(`Unsupported party: ${policy.party}`);
  if (!RESOURCE_TYPES.has(policy.resourceType)) throw new TypeError(`Unsupported resource type: ${policy.resourceType}`);
  if (!ACTIONS.has(policy.action) || (!allowInherit && policy.action === POLICY_ACTION.INHERIT)) {
    throw new TypeError(`Unsupported policy action: ${policy.action}`);
  }
  if (typeof policy.temporary !== "boolean") throw new TypeError("Policy temporary must be boolean.");
  if (policy.temporary && (!Number.isInteger(policy.tabId) || policy.tabId < 0)) {
    throw new TypeError("Temporary policies require a non-negative tabId.");
  }
  if (!policy.temporary && policy.tabId !== undefined) throw new TypeError("Persistent policies cannot have a tabId.");
  return policy;
}

export function policyIdentity(policy) {
  const lifetime = policy.temporary ? `tab:${policy.tabId}` : "persistent";
  return `${lifetime}:${policyCoordinates(policy)}`;
}

export function policyCoordinates(policy) {
  return [policy.scope, policy.target, policy.party, policy.resourceType].join(":");
}

function validateDomain(value, field) {
  if (value === WILDCARD) return;
  if (typeof value !== "string" || value.length === 0 || value.includes(":") || value.includes("/")) {
    throw new TypeError(`Policy ${field} must be '*' or a hostname.`);
  }
}

function normalizePolicyDomain(value) {
  return value === WILDCARD ? value : String(value).trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}
