import { expect } from "@playwright/test";
import { attachYouTubeTelemetry, SIGNED_IN_PROFILE, majorErrors, openYouTube, test } from "./fixture.js";
import { observeYouTubeAdSurfaces } from "./observations.js";

const routes = [
  ["search", "/results?search_query=creative+commons"],
  ["channel", "/@YouTube"],
  ["playlist", "/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb"],
  ["shorts", "/shorts/aqz-KE-bpKQ"],
];

for (const [name, path] of routes) {
  test(`${name} route loads without a reload loop or error flood`, async ({ context }, testInfo) => {
    const { page, consoleErrors, pageErrors } = await openYouTube(context, path);
    let navigations = 0;
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(navigations).toBeLessThan(3);
    expect(majorErrors(consoleErrors, pageErrors).length).toBeLessThan(10);
    await attachYouTubeTelemetry(context, testInfo, {
      scenario: name, observations: await observeYouTubeAdSurfaces(page),
      playback: { bodyAvailable: true, reloadLoopAbsent: navigations < 3, consoleErrorBurstAbsent: majorErrors(consoleErrors, pageErrors).length < 10 },
    });
  });
}

test("clean profile exercises the signed-out baseline", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context);
  const cookies = await context.cookies("https://www.youtube.com");
  expect(cookies.some(({ name }) => ["SAPISID", "__Secure-3PAPISID"].includes(name))).toBe(false);
  await expect(page.locator("body")).toBeVisible();
  await attachYouTubeTelemetry(context, testInfo, { scenario: "signed-out", playback: { bodyAvailable: true } });
});

test("optional persistent profile exercises the signed-in baseline", async ({ context }, testInfo) => {
  test.skip(!SIGNED_IN_PROFILE, "Set ORIGINMATRIX_YOUTUBE_USER_DATA_DIR to a dedicated signed-in test profile.");
  const { page } = await openYouTube(context);
  await expect(page.locator("button#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn")).toBeVisible();
  await attachYouTubeTelemetry(context, testInfo, { scenario: "signed-in", playback: { accountControlsAvailable: true } });
});
