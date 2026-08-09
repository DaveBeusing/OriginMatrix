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
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const state = await worker.evaluate(async (url) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    await new Promise((resolve) => setTimeout(resolve, 250));
    return chrome.runtime.sendMessage({ type: "GET_TAB_STATE", tabId: tab.id, url });
  }, page.url());
  expect(state.ok).toBe(true);
  expect(state.observation?.topUrl).toBe(page.url());
});
