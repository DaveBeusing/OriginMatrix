import { expect } from "@playwright/test";
import { attachYouTubeTelemetry, test, openYouTube, WATCH_URL } from "./fixture.js";
import { observeYouTubeAdSurfaces } from "./observations.js";

test("watch page exposes video, comments, and fullscreen controls", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await expect(page.locator("video")).toBeAttached();
  await expect(page.locator("button.ytp-fullscreen-button")).toBeVisible();
  await page.locator("#comments").scrollIntoViewIfNeeded();
  await expect(page.locator("#comments")).toBeAttached();
  await attachYouTubeTelemetry(context, testInfo, { scenario: "watch", observations: await observeYouTubeAdSurfaces(page), playback: { videoAvailable: true, fullscreenAvailable: true, commentsAvailable: true } });
});
