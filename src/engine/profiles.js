import { PARTY, POLICY_ACTION, RESOURCE_TYPE, createPolicy } from "../shared/models.js";

export const PROFILE_NAMES = Object.freeze(["balanced", "strict", "custom"]);

export function policiesForProfile(name) {
  if (!PROFILE_NAMES.includes(name)) throw new TypeError(`Unknown profile: ${name}`);
  if (name === "custom") return [];
  if (name === "strict") {
    return [
      createPolicy({ party: PARTY.FIRST_PARTY, action: POLICY_ACTION.ALLOW }),
      createPolicy({ party: PARTY.THIRD_PARTY, action: POLICY_ACTION.BLOCK }),
    ];
  }
  return [
    createPolicy({ party: PARTY.FIRST_PARTY, action: POLICY_ACTION.ALLOW }),
    ...[RESOURCE_TYPE.SCRIPT, RESOURCE_TYPE.FRAME, RESOURCE_TYPE.XHR, RESOURCE_TYPE.WEBSOCKET]
      .map((resourceType) => createPolicy({ party: PARTY.THIRD_PARTY, resourceType, action: POLICY_ACTION.BLOCK })),
  ];
}
