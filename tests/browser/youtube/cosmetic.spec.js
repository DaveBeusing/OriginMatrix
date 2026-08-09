import { test, openYouTube, WATCH_URL } from "./fixture.js";
import { observeAdSurface } from "./observations.js";

test("records ad surfaces without inferring blocking from absence", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await page.waitForTimeout(5_000);
  const observations = await Promise.all([
    observeAdSurface(page, "promoted-feed", ["ytd-promoted-video-renderer", "ytd-ad-slot-renderer"]),
    observeAdSurface(page, "promoted-shorts", ["ytd-reel-item-renderer:has([aria-label*='Ad'])"]),
    observeAdSurface(page, "sidebar-display", ["#player-ads", "ytd-action-companion-ad-renderer"]),
    observeAdSurface(page, "player-ad-state", [".ad-showing", ".ytp-ad-player-overlay", ".ytp-ad-preview-container"]),
    observeAdSurface(page, "pre-mid-roll-indicators", [".ytp-ad-text", ".ytp-ad-simple-ad-badge"]),
  ]);
  await testInfo.attach("ad-observations", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
});
