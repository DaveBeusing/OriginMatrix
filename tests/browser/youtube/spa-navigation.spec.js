import { expect } from "@playwright/test";
import { attachYouTubeTelemetry, sendExtensionMessage, test, openYouTube, WATCH_URL } from "./fixture.js";

test("client-side video navigation changes the watch route without reloading", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await expect(page.locator("video")).toBeAttached();
  const initialUrl = page.url();
  const currentVideoId = new URL(initialUrl).searchParams.get("v");
  const candidate = page.locator(`a[href*='/watch?v=']:visible${currentVideoId ? `:not([href*='${currentVideoId}'])` : ""}`).first();
  await expect(candidate).toBeVisible();
  await candidate.click();
  await expect.poll(() => page.url()).not.toBe(initialUrl);
  await expect(page.locator("video")).toBeAttached();
  await page.waitForTimeout(250);
  const state = await sendExtensionMessage(context, { type: "GET_TAB_STATE", url: page.url() }, { tabUrl: page.url() });
  expect(state.ok).toBe(true);
  expect(state.observation?.topUrl).toBe(page.url());
  await attachYouTubeTelemetry(context, testInfo, { scenario: "spa-navigation", playback: { routeChanged: page.url() !== initialUrl, videoAvailable: true, extensionStateUpdated: state.observation?.topUrl === page.url() } });
});
