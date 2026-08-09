export const YOUTUBE_EVIDENCE = Object.freeze({
  NOT_OBSERVED: "not_observed",
  OBSERVED: "observed",
  SUPPRESSED: "suppressed",
  VISIBLE: "visible",
  UNKNOWN: "unknown",
});

export const VERIFICATION_STATUS = Object.freeze({
  VERIFIED: "verified",
  PARTIALLY_VERIFIED: "partially_verified",
  NOT_REPRODUCED: "not_reproduced",
  UNKNOWN: "unknown",
});

const PERFORMANCE_KEYS = Object.freeze([
  "contentScriptSetupTimeMs", "mutationRecordsProcessed", "mutationBatchesProcessed", "mutationRootsScanned",
  "cosmeticElementsHidden", "cosmeticScanTimeMs", "maximumCosmeticBatchTimeMs", "proceduralBatchesProcessed",
  "proceduralNodesEvaluated", "scriptletsExecuted", "dnrRulesAdded", "dnrRulesRemoved", "dnrRulesChanged", "dnrRulesUnchanged",
]);

export function classifyYouTubeAdEvidence({ detected, visible, originMatrixHidden, error = null }) {
  if (error || typeof detected !== "boolean") return YOUTUBE_EVIDENCE.UNKNOWN;
  if (!detected) return YOUTUBE_EVIDENCE.NOT_OBSERVED;
  if (originMatrixHidden === true) return YOUTUBE_EVIDENCE.SUPPRESSED;
  if (visible === true) return YOUTUBE_EVIDENCE.VISIBLE;
  return YOUTUBE_EVIDENCE.OBSERVED;
}

export function summarizeYouTubeTelemetry({ scenario, accountState = "signed_out", observations = [], playback = {}, performance = {} }) {
  if (typeof scenario !== "string" || !scenario || !["signed_out", "signed_in"].includes(accountState) || !Array.isArray(observations)) {
    throw new TypeError("Valid YouTube telemetry context is required.");
  }
  const advertising = Object.fromEntries(Object.values(YOUTUBE_EVIDENCE).map((status) => [status, 0]));
  for (const item of observations) {
    if (!Object.values(YOUTUBE_EVIDENCE).includes(item?.status)) throw new TypeError("Invalid YouTube advertising evidence.");
    advertising[item.status] += 1;
  }
  const healthValues = Object.values(playback).filter((value) => typeof value === "boolean");
  const playbackStatus = healthValues.length === 0 ? VERIFICATION_STATUS.UNKNOWN
    : healthValues.every(Boolean) ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.PARTIALLY_VERIFIED;
  const advertisingStatus = observations.length === 0 ? VERIFICATION_STATUS.UNKNOWN
    : advertising.visible > 0 || advertising.observed > 0 ? VERIFICATION_STATUS.PARTIALLY_VERIFIED
      : advertising.suppressed > 0 ? VERIFICATION_STATUS.VERIFIED
        : advertising.unknown > 0 ? VERIFICATION_STATUS.UNKNOWN : VERIFICATION_STATUS.NOT_REPRODUCED;
  const metrics = Object.fromEntries(PERFORMANCE_KEYS.map((key) => [key, finiteMetric(performance[key])]));
  return Object.freeze({
    scenario, accountState, advertisingStatus, playbackStatus,
    advertising: Object.freeze(advertising),
    playback: Object.freeze(Object.fromEntries(Object.entries(playback).map(([key, value]) => [key, typeof value === "boolean" ? value : null]))),
    performance: Object.freeze(metrics),
  });
}

export function aggregateYouTubeTelemetry(sessions) {
  if (!Array.isArray(sessions) || sessions.some((item) => !item?.advertising || !item?.playback)) throw new TypeError("YouTube telemetry sessions are required.");
  const totals = { sessionsTested: sessions.length, adStatesObserved: 0, adStatesSuppressed: 0, adStatesVisible: 0, unknownAdOutcomes: 0, playbackFailures: 0, spaFailures: 0, majorHealthRegressions: 0 };
  for (const session of sessions) {
    totals.adStatesObserved += session.advertising.observed + session.advertising.suppressed + session.advertising.visible;
    totals.adStatesSuppressed += session.advertising.suppressed;
    totals.adStatesVisible += session.advertising.visible;
    totals.unknownAdOutcomes += session.advertising.unknown;
    const failed = Object.entries(session.playback).filter(([, value]) => value === false).map(([key]) => key);
    totals.playbackFailures += failed.filter((key) => /video|play|pause|seek|media/i.test(key)).length;
    totals.spaFailures += failed.filter((key) => /route|navigation|extensionState/i.test(key)).length;
    totals.majorHealthRegressions += failed.filter((key) => /reload|console|comments|fullscreen|body/i.test(key)).length;
  }
  return Object.freeze(totals);
}

function finiteMetric(value) { return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null; }
