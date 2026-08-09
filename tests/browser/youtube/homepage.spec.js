import { expect } from "@playwright/test";
import { attachYouTubeTelemetry, test, majorErrors, openYouTube } from "./fixture.js";
import { observeYouTubeAdSurfaces } from "./observations.js";

test("YouTube homepage loads without a reload loop or console-error flood", async ({ context }, testInfo) => {
  const { page, consoleErrors, pageErrors } = await openYouTube(context);
  let mainFrameNavigations = 0;
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) mainFrameNavigations += 1; });
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(5_000);
  expect(mainFrameNavigations).toBeLessThan(3);
  expect(majorErrors(consoleErrors, pageErrors).length).toBeLessThan(10);
  await attachYouTubeTelemetry(context, testInfo, {
    scenario: "homepage", observations: await observeYouTubeAdSurfaces(page),
    playback: { bodyAvailable: true, reloadLoopAbsent: mainFrameNavigations < 3, consoleErrorBurstAbsent: majorErrors(consoleErrors, pageErrors).length < 10 },
  });
});
