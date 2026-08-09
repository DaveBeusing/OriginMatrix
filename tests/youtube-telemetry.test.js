import test from "node:test";
import assert from "node:assert/strict";
import { aggregateYouTubeTelemetry, classifyYouTubeAdEvidence, summarizeYouTubeTelemetry, VERIFICATION_STATUS, YOUTUBE_EVIDENCE } from "../src/diagnostics/youtube-telemetry.js";

test("classifies absent, observed, suppressed, visible, and unknown ad evidence", () => {
  assert.equal(classifyYouTubeAdEvidence({ detected: false }), YOUTUBE_EVIDENCE.NOT_OBSERVED);
  assert.equal(classifyYouTubeAdEvidence({ detected: true, visible: false, originMatrixHidden: false }), YOUTUBE_EVIDENCE.OBSERVED);
  assert.equal(classifyYouTubeAdEvidence({ detected: true, visible: false, originMatrixHidden: true }), YOUTUBE_EVIDENCE.SUPPRESSED);
  assert.equal(classifyYouTubeAdEvidence({ detected: true, visible: true, originMatrixHidden: false }), YOUTUBE_EVIDENCE.VISIBLE);
  assert.equal(classifyYouTubeAdEvidence({ detected: null, error: "detached" }), YOUTUBE_EVIDENCE.UNKNOWN);
});

test("summarizes observations, playback health, and only finite measured performance", () => {
  const result = summarizeYouTubeTelemetry({
    scenario: "watch", observations: [{ status: "suppressed" }, { status: "not_observed" }],
    playback: { playable: true, seek: true, comments: null },
    performance: { mutationRecordsProcessed: 12, cosmeticScanTimeMs: 1.25, scriptletsExecuted: -1 },
  });
  assert.equal(result.advertisingStatus, VERIFICATION_STATUS.VERIFIED);
  assert.equal(result.playbackStatus, VERIFICATION_STATUS.VERIFIED);
  assert.deepEqual(result.advertising, { not_observed: 1, observed: 0, suppressed: 1, visible: 0, unknown: 0 });
  assert.equal(result.performance.mutationRecordsProcessed, 12);
  assert.equal(result.performance.cosmeticScanTimeMs, 1.25);
  assert.equal(result.performance.scriptletsExecuted, null);
  assert.equal(result.playback.comments, null);
});

test("does not promote absence to verified blocking and reports health failures", () => {
  const absent = summarizeYouTubeTelemetry({ scenario: "homepage", observations: [{ status: "not_observed" }] });
  assert.equal(absent.advertisingStatus, VERIFICATION_STATUS.NOT_REPRODUCED);
  assert.equal(absent.playbackStatus, VERIFICATION_STATUS.UNKNOWN);
  const failed = summarizeYouTubeTelemetry({ scenario: "spa", observations: [], playback: { navigation: false } });
  assert.equal(failed.advertisingStatus, VERIFICATION_STATUS.UNKNOWN);
  assert.equal(failed.playbackStatus, VERIFICATION_STATUS.PARTIALLY_VERIFIED);
  assert.throws(() => summarizeYouTubeTelemetry({ scenario: "watch", observations: [{ status: "blocked" }] }), /evidence/);
});

test("aggregates sessions without inventing unobserved advertising outcomes", () => {
  const sessions = [
    summarizeYouTubeTelemetry({ scenario: "watch", observations: [{ status: "suppressed" }, { status: "not_observed" }], playback: { videoStarted: true, seek: false } }),
    summarizeYouTubeTelemetry({ scenario: "spa", observations: [{ status: "visible" }, { status: "unknown" }], playback: { routeChanged: false, reloadLoopAbsent: false } }),
  ];
  assert.deepEqual(aggregateYouTubeTelemetry(sessions), {
    sessionsTested: 2, adStatesObserved: 2, adStatesSuppressed: 1, adStatesVisible: 1, unknownAdOutcomes: 1,
    playbackFailures: 1, spaFailures: 1, majorHealthRegressions: 1,
  });
});
