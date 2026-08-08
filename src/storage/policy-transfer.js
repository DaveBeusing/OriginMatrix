import { POLICY_ACTION, createPolicy } from "../shared/models.js";

export const EXPORT_FORMAT = "originmatrix";
export const EXPORT_VERSION = 1;

export function exportPolicies(policies, exportedAt = new Date().toISOString()) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, policies };
}

export function importPolicies(input) {
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); }
    catch { throw new TypeError("Only OriginMatrix JSON imports are supported; uMatrix text rules are not yet supported."); }
  }
  if (!value || value.format !== EXPORT_FORMAT || value.version !== EXPORT_VERSION || !Array.isArray(value.policies)) {
    throw new TypeError("Unsupported OriginMatrix import format or version.");
  }
  return value.policies.map((inputPolicy) => {
    const policy = createPolicy(inputPolicy);
    if (policy.temporary || policy.action === POLICY_ACTION.INHERIT) throw new TypeError("Imports may contain persistent allow/block policies only.");
    return policy;
  });
}
