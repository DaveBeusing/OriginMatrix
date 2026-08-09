import { PARTY, POLICY_ACTION, RESOURCE_TYPE, createPolicy } from "../shared/models.js";

export const PROFILE_NAMES = Object.freeze(["balanced", "strict", "relaxed"]);

const DEFINITIONS = Object.freeze({
  balanced: Object.freeze({
    name: "balanced", title: "Balanced", matrixMode: "normal", trackingLevel: "enhanced",
    features: Object.freeze({ network: true, cosmetic: true, scriptlets: true }),
  }),
  strict: Object.freeze({
    name: "strict", title: "Strict", matrixMode: "strict", trackingLevel: "enhanced",
    features: Object.freeze({ network: true, cosmetic: true, scriptlets: true }),
  }),
  relaxed: Object.freeze({
    name: "relaxed", title: "Relaxed", matrixMode: "minimal", trackingLevel: "enhanced",
    features: Object.freeze({ network: true, cosmetic: true, scriptlets: false }),
  }),
});

export function profileDefinition(name) {
  if (!PROFILE_NAMES.includes(name)) throw new TypeError(`Unknown profile: ${name}`);
  return DEFINITIONS[name];
}

export function policiesForProfile(name) {
  profileDefinition(name);
  if (name !== "strict") return [];
  return [RESOURCE_TYPE.SCRIPT, RESOURCE_TYPE.FRAME, RESOURCE_TYPE.XHR]
    .map((resourceType) => createPolicy({ party: PARTY.THIRD_PARTY, resourceType, action: POLICY_ACTION.BLOCK }));
}
