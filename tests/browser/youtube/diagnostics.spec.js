import { expect } from "@playwright/test";
import { test } from "./fixture.js";

test("extension exposes conservative YouTube diagnostics", async ({ context }) => {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const response = await worker.evaluate(() => chrome.runtime.sendMessage({ type: "GET_YOUTUBE_DIAGNOSTICS" }));
  expect(response.ok).toBe(true);
  expect(response.diagnostics.relevantRules).toBeGreaterThan(0);
  expect(response.diagnostics.capabilities.runtimePlaybackVerification).toBe(true);
  expect(response.diagnostics.capabilities.advertisingTelemetry).toBe(true);
});
