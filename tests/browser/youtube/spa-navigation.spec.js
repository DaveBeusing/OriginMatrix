import { expect } from "@playwright/test";
import { test, openYouTube, WATCH_URL } from "./fixture.js";

test("client-side video navigation changes the watch route without reloading", async ({ context }) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await expect(page.locator("video")).toBeAttached();
  const initialUrl = page.url();
  const candidate = page.locator("ytd-compact-video-renderer a#thumbnail[href*='watch?v=']").first();
  await expect(candidate).toBeVisible();
  await candidate.click();
  await expect.poll(() => page.url()).not.toBe(initialUrl);
  await expect(page.locator("video")).toBeAttached();
});
