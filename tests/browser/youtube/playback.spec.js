import { expect } from "@playwright/test";
import { test, openYouTube, WATCH_URL } from "./fixture.js";

test("video starts and pause, play, and seek remain functional", async ({ context }) => {
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
});
