import { attachYouTubeTelemetry, test, openYouTube, WATCH_URL } from "./fixture.js";
import { observeYouTubeAdSurfaces } from "./observations.js";

test("records ad surfaces without inferring blocking from absence", async ({ context }, testInfo) => {
  const { page } = await openYouTube(context, WATCH_URL);
  await page.waitForTimeout(5_000);
  const observations = await observeYouTubeAdSurfaces(page);
  await testInfo.attach("ad-observations", { body: JSON.stringify(observations, null, 2), contentType: "application/json" });
  await attachYouTubeTelemetry(context, testInfo, { scenario: "watch-ad-surfaces", observations });
});
