export const POLICY_ACTION = Object.freeze({
  ALLOW: "allow",
  BLOCK: "block",
  INHERIT: "inherit",
});

export const PARTY = Object.freeze({
  FIRST_PARTY: "firstParty",
  THIRD_PARTY: "thirdParty",
});

export const RESOURCE_TYPE = Object.freeze({
  SCRIPT: "script",
});

export function createThirdPartyScriptPolicy({ site, tabId }) {
  if (typeof site !== "string" || site.length === 0) {
    throw new TypeError("A non-empty site is required.");
  }
  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new TypeError("A valid tabId is required.");
  }

  return Object.freeze({
    id: `tab:${tabId}:${site}:thirdParty:script:block`,
    scope: site,
    target: "*",
    party: PARTY.THIRD_PARTY,
    resourceType: RESOURCE_TYPE.SCRIPT,
    action: POLICY_ACTION.BLOCK,
    temporary: true,
    tabId,
  });
}
