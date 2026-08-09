import { expect } from "@playwright/test";
import { attachYouTubeTelemetry, test, openYouTube, WATCH_URL } from "./fixture.js";

test("video starts and pause, play, and seek remain functional", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context, WATCH_URL);
  const video = page.locator("video");
  await expect(video).toBeAttached();
  await video.evaluate(async (element) => { element.muted = true; await element.play(); });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(0);
  await video.evaluate((element) => element.pause());
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(true);
  const beforeSeek = await video.evaluate((element) => element.currentTime);
  await video.evaluate((element) => { element.currentTime = Math.min(element.duration || 30, element.currentTime + 5); });
  await expect.poll(() => video.evaluate((element) => element.currentTime)).toBeGreaterThan(beforeSeek);
  await video.evaluate((element) => element.play());
  await expect.poll(() => video.evaluate((element) => element.paused)).toBe(false);
  const mediaErrorAbsent = await video.evaluate((element) => element.error === null);
  await attachYouTubeTelemetry(context, testInfo, { scenario: "playback", playback: { videoStarted: true, pausePlay: true, seek: true, mediaErrorAbsent } });
});
