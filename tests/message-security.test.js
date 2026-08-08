import test from "node:test";
import assert from "node:assert/strict";
import { assertTrustedMessage, MAX_INTERNAL_MESSAGE_BYTES } from "../src/background/message-security.js";

test("accepts serializable messages only from this extension", () => {
  const message = { type: "GET_DASHBOARD_STATE" };
  assert.equal(assertTrustedMessage(message, { id: "originmatrix" }, "originmatrix"), message);
  assert.throws(() => assertTrustedMessage(message, { id: "other" }, "originmatrix"), /untrusted/);
  assert.throws(() => assertTrustedMessage({ type: "X", value: "x".repeat(MAX_INTERNAL_MESSAGE_BYTES) }, { id: "originmatrix" }, "originmatrix"), /size limit/);
});
