import { expect } from "@playwright/test";
import { sendExtensionMessage, test } from "./fixture.js";

test("extension exposes conservative YouTube diagnostics", async ({ context }) => {
  const response = await sendExtensionMessage(context, { type: "GET_YOUTUBE_DIAGNOSTICS" });
  expect(response.ok).toBe(true);
  expect(response.diagnostics.relevantRules).toBeGreaterThan(0);
  expect(response.diagnostics.capabilities.runtimePlaybackVerification).toBe(true);
  expect(response.diagnostics.capabilities.advertisingTelemetry).toBe(true);
});
