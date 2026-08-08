import { PARTY, POLICY_ACTION, RESOURCE_TYPE, WILDCARD } from "../shared/models.js";
import { domainMatches, normalizeHostname } from "./domain-normalizer.js";

export const MATRIX_RESOURCE_TYPES = Object.freeze([
  RESOURCE_TYPE.ALL,
  RESOURCE_TYPE.COOKIE,
  RESOURCE_TYPE.STYLESHEET,
  RESOURCE_TYPE.IMAGE,
  RESOURCE_TYPE.MEDIA,
  RESOURCE_TYPE.SCRIPT,
  RESOURCE_TYPE.XHR,
  RESOURCE_TYPE.FRAME,
  RESOURCE_TYPE.FONT,
  RESOURCE_TYPE.WEBSOCKET,
  RESOURCE_TYPE.OTHER,
]);

export function buildMatrixModel({ tabId, topDomain, domains, policies, temporaryPolicies = [], resolver }) {
  const site = normalizeHostname(topDomain);
  const definitions = [
    { kind: "global", label: "GLOBAL", scope: WILDCARD, target: WILDCARD, party: PARTY.ANY, total: null },
    { kind: "site", label: "*", scope: site, target: WILDCARD, party: PARTY.ANY, total: null },
    { kind: "firstParty", label: "1st-party", scope: site, target: WILDCARD, party: PARTY.FIRST_PARTY, total: null },
    { kind: "thirdParty", label: "3rd-party", scope: site, target: WILDCARD, party: PARTY.THIRD_PARTY, total: null },
    ...Object.entries(domains ?? {})
      .sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]))
      .map(([target, counts]) => ({ kind: "domain", label: target, scope: site, target, party: PARTY.ANY, total: counts.total })),
  ];

  const rows = definitions.map((definition) => ({
    ...definition,
    cells: Object.fromEntries(MATRIX_RESOURCE_TYPES.map((resourceType) => [
      resourceType,
      projectCell({ definition, resourceType, tabId, site, policies, temporaryPolicies, resolver }),
    ])),
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

function projectCell({ definition, resourceType, tabId, site, policies, temporaryPolicies, resolver }) {
  const coordinateMatch = (policy) =>
    policy.scope === definition.scope
    && policy.target === definition.target
    && policy.party === definition.party
    && policy.resourceType === resourceType;
  const temporary = temporaryPolicies.find((policy) => coordinateMatch(policy) && policy.tabId === tabId)
    ?? policies.find((policy) => coordinateMatch(policy) && policy.temporary && policy.tabId === tabId)
    ?? null;
  const persistent = policies.find((policy) => coordinateMatch(policy) && !policy.temporary) ?? null;
  const explicit = temporary ?? persistent;
  const effective = resolveForRow({ definition, resourceType, tabId, site, policies, resolver });
  return {
    explicitAction: explicit?.action ?? POLICY_ACTION.INHERIT,
    editAction: temporary?.action ?? persistent?.action ?? POLICY_ACTION.INHERIT,
    effectiveAction: effective.action,
    source: explicit ? (explicit.temporary ? "temporary" : "persistent") : null,
    winningPolicyId: effective.policy?.id ?? null,
  };
}

function resolveForRow({ definition, resourceType, tabId, site, policies, resolver }) {
  const requestResource = resourceType === RESOURCE_TYPE.ALL ? RESOURCE_TYPE.OTHER : resourceType;
  const compatible = policies.filter((policy) => {
    if (resourceType === RESOURCE_TYPE.ALL ? policy.resourceType !== RESOURCE_TYPE.ALL : ![RESOURCE_TYPE.ALL, resourceType].includes(policy.resourceType)) return false;
    if (definition.kind === "global") return policy.scope === WILDCARD && policy.target === WILDCARD && policy.party === PARTY.ANY;
    if (definition.kind === "site") return policy.target === WILDCARD && policy.party === PARTY.ANY;
    if (definition.kind === "firstParty" || definition.kind === "thirdParty") {
      return policy.target === WILDCARD && (policy.party === PARTY.ANY || policy.party === definition.party);
    }
    return true;
  });
  const targetDomain = definition.kind === "domain"
    ? definition.target
    : definition.party === PARTY.THIRD_PARTY ? "third-party.invalid" : site;
  const party = definition.kind === "domain" ? classifyParty(site, definition.target) : definition.party === PARTY.THIRD_PARTY ? PARTY.THIRD_PARTY : PARTY.FIRST_PARTY;
  return resolver.resolve({ topDomain: site, targetDomain, resourceType: requestResource, party, tabId }, compatible);
}
