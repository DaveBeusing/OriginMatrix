import { PARTY, POLICY_ACTION, RESOURCE_TYPE } from "../shared/models.js";
import { domainMatches, normalizeHostname } from "./domain-normalizer.js";

export const MATRIX_RESOURCE_TYPES = Object.freeze([
  RESOURCE_TYPE.SCRIPT,
  RESOURCE_TYPE.XHR,
  RESOURCE_TYPE.FRAME,
  RESOURCE_TYPE.IMAGE,
  RESOURCE_TYPE.MEDIA,
]);

export function buildMatrixModel({ tabId, topDomain, domains, policies, resolver }) {
  const site = normalizeHostname(topDomain);
  const rows = Object.entries(domains ?? {})
    .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
    .map(([target, counts]) => ({
      target,
      total: counts.total,
      cells: Object.fromEntries(MATRIX_RESOURCE_TYPES.map((resourceType) => {
        const { temporary, persistent } = findExplicitPolicies({ policies, tabId, site, target, resourceType });
        const explicit = temporary ?? persistent;
        const result = resolver.resolve({
          topDomain: site,
          targetDomain: target,
          resourceType,
          party: classifyParty(site, target),
          tabId,
        }, policies);
        return [resourceType, {
          explicitAction: explicit?.action ?? POLICY_ACTION.INHERIT,
          editAction: temporary?.action ?? POLICY_ACTION.INHERIT,
          effectiveAction: result.action,
          source: explicit ? (explicit.temporary ? "temporary" : "persistent") : null,
          winningPolicyId: result.policy?.id ?? null,
        }];
      })),
    }));
  return { site, resourceTypes: MATRIX_RESOURCE_TYPES, rows };
}

export function classifyParty(site, target) {
  const normalizedSite = normalizeHostname(site);
  const normalizedTarget = normalizeHostname(target);
  return domainMatches(normalizedTarget, normalizedSite) || domainMatches(normalizedSite, normalizedTarget)
    ? PARTY.FIRST_PARTY
    : PARTY.THIRD_PARTY;
}

function findExplicitPolicies({ policies, tabId, site, target, resourceType }) {
  const matches = policies.filter((policy) =>
    policy.scope === site
    && policy.target === target
    && policy.party === PARTY.ANY
    && policy.resourceType === resourceType
    && ((policy.temporary && policy.tabId === tabId) || !policy.temporary));
  return {
    temporary: matches.find((policy) => policy.temporary) ?? null,
    persistent: matches.find((policy) => !policy.temporary) ?? null,
  };
}
