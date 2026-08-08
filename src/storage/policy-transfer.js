import { POLICY_ACTION, createPolicy } from "../shared/models.js";

export const EXPORT_FORMAT = "originmatrix";
export const EXPORT_VERSION = 1;
export const POLICY_IMPORT_LIMITS = Object.freeze({ bytes: 1_000_000, policies: 10_000 });

export function exportPolicies(policies, exportedAt = new Date().toISOString()) {
  return { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt, policies };
}

export function importPolicies(input) {
  const serialized = typeof input === "string" ? input : stringifyImport(input);
  if (new TextEncoder().encode(serialized).length > POLICY_IMPORT_LIMITS.bytes) throw new RangeError("Policy import exceeds the size limit.");
  let value = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); }
    catch { throw new TypeError("Only OriginMatrix JSON imports are supported; uMatrix text rules are not yet supported."); }
  }
  if (!value || value.format !== EXPORT_FORMAT || value.version !== EXPORT_VERSION || !Array.isArray(value.policies)) {
    throw new TypeError("Unsupported OriginMatrix import format or version.");
  }
  if (value.policies.length > POLICY_IMPORT_LIMITS.policies) throw new RangeError("Policy import contains too many policies.");
  return value.policies.map((inputPolicy) => {
    const policy = createPolicy(inputPolicy);
    if (policy.temporary || policy.action === POLICY_ACTION.INHERIT) throw new TypeError("Imports may contain persistent allow/block policies only.");
    return policy;
  });
}

function stringifyImport(value) {
  try { return JSON.stringify(value); }
  catch { throw new TypeError("Policy imports must be serializable."); }
}
