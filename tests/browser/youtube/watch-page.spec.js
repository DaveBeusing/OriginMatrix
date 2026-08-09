import { expect } from "@playwright/test";
import { test, openYouTube, WATCH_URL } from "./fixture.js";

test("watch page exposes video, comments, and fullscreen controls", async ({ context }) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await expect(page.locator("video")).toBeAttached();
  await expect(page.locator("button.ytp-fullscreen-button")).toBeVisible();
  await page.locator("#comments").scrollIntoViewIfNeeded();
  await expect(page.locator("#comments")).toBeAttached();
});
