import { PARTY, POLICY_ACTION, RESOURCE_TYPE, WILDCARD, policyCoordinates, validatePolicy } from "../shared/models.js";
import { domainMatches, normalizeHostname } from "./domain-normalizer.js";

export class PolicyResolver {
  resolve(request, policies) {
    const normalized = normalizeRequest(request);
    const validated = policies.map((policy) => validatePolicy(policy));
    const deletedCoordinates = new Set(validated
      .filter((policy) => policy.temporary && policy.tabId === normalized.tabId && policy.action === POLICY_ACTION.INHERIT)
      .map(policyCoordinates));
    const candidates = validated
      .filter((policy) => policy.action !== POLICY_ACTION.INHERIT)
      .filter((policy) => policy.temporary || !deletedCoordinates.has(policyCoordinates(policy)))
      .map((policy, index) => ({ policy, index }))
      .filter(({ policy }) => matches(policy, normalized))
      .map(({ policy, index }) => ({ policy, index, score: specificity(policy) }))
      .sort((a, b) => b.score - a.score || a.policy.id.localeCompare(b.policy.id) || a.index - b.index);

    const winner = candidates[0] ?? null;
    return {
      action: winner?.policy.action ?? POLICY_ACTION.INHERIT,
      policy: winner?.policy ?? null,
      reason: winner ? `Matched ${winner.policy.id} at specificity ${winner.score}.` : "No matching policy; inherited.",
      resolutionPath: candidates.map(({ policy, score }) => ({ policyId: policy.id, score })),
    };
  }
}

export function specificity(policy) {
  const hasSite = policy.scope !== WILDCARD;
  const hasTarget = policy.target !== WILDCARD || policy.party !== PARTY.ANY;
  const hasResource = policy.resourceType !== RESOURCE_TYPE.ALL;
  let base = 100;
  if (hasSite && hasTarget && hasResource) base = 800;
  else if (hasSite && hasTarget) base = 700;
  else if (hasSite && hasResource) base = 600;
  else if (hasSite) base = 500;
  else if (hasTarget && hasResource) base = 400;
  else if (hasTarget) base = 300;
  else if (hasResource) base = 200;
  return policy.temporary ? 900 + base : base;
}

function matches(policy, request) {
  if (policy.temporary && policy.tabId !== request.tabId) return false;
  if (!domainMatches(request.topDomain, policy.scope)) return false;
  if (!domainMatches(request.targetDomain, policy.target)) return false;
  if (policy.party !== PARTY.ANY && policy.party !== request.party) return false;
  return policy.resourceType === RESOURCE_TYPE.ALL || policy.resourceType === request.resourceType;
}

function normalizeRequest(request) {
  if (!request || typeof request !== "object") throw new TypeError("Request context is required.");
  if (!Object.values(PARTY).includes(request.party) || request.party === PARTY.ANY) throw new TypeError("Request party is invalid.");
  if (!Object.values(RESOURCE_TYPE).includes(request.resourceType) || request.resourceType === RESOURCE_TYPE.ALL) {
    throw new TypeError("Request resourceType is invalid.");
  }
  return {
    ...request,
    topDomain: normalizeHostname(request.topDomain),
    targetDomain: normalizeHostname(request.targetDomain),
  };
}
