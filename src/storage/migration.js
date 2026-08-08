import { SCHEMA_VERSION, createPolicy } from "../shared/models.js";

export function createEmptyPolicyDocument() {
  return { schemaVersion: SCHEMA_VERSION, policies: [], ruleIds: {} };
}

export function migratePolicyDocument(value) {
  if (value === undefined || value === null) return createEmptyPolicyDocument();
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Policy document must be an object.");
  if (value.schemaVersion !== SCHEMA_VERSION) throw new TypeError(`Unsupported policy schema version: ${value.schemaVersion}`);
  if (!Array.isArray(value.policies)) throw new TypeError("Policy document policies must be an array.");
  const policies = value.policies.map((policy) => createPolicy(policy));
  const ids = new Set();
  for (const policy of policies) {
    if (ids.has(policy.id)) throw new TypeError(`Duplicate policy id: ${policy.id}`);
    ids.add(policy.id);
  }
  return { schemaVersion: SCHEMA_VERSION, policies, ruleIds: sanitizeRuleIds(value.ruleIds) };
}

function sanitizeRuleIds(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("ruleIds must be an object.");
  return Object.fromEntries(Object.entries(value).filter(([, id]) => Number.isInteger(id) && id > 0));
}
