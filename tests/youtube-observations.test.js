import test from "node:test";
import assert from "node:assert/strict";
import { classifyAdObservation, OBSERVATION_STATUS } from "./browser/youtube/observations.js";

test("classifies ad evidence without treating absence as blocked", () => {
  assert.equal(classifyAdObservation({ detected: false, visible: false, originMatrixHidden: false }), OBSERVATION_STATUS.NOT_OBSERVED);
  assert.equal(classifyAdObservation({ detected: true, visible: false, originMatrixHidden: true }), OBSERVATION_STATUS.OBSERVED_BLOCKED);
  assert.equal(classifyAdObservation({ detected: true, visible: true, originMatrixHidden: false }), OBSERVATION_STATUS.OBSERVED_VISIBLE);
  assert.equal(classifyAdObservation({ detected: true, visible: false, originMatrixHidden: false }), OBSERVATION_STATUS.UNKNOWN);
  assert.equal(classifyAdObservation({ detected: null, error: "detached" }), OBSERVATION_STATUS.UNKNOWN);
});
