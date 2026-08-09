import { expect } from "@playwright/test";
import { SIGNED_IN_PROFILE, majorErrors, openYouTube, test } from "./fixture.js";

const routes = [
  ["search", "/results?search_query=creative+commons"],
  ["channel", "/@YouTube"],
  ["playlist", "/playlist?list=PLbpi6ZahtOH6Blw3RGYpWkSByi_T7Rygb"],
  ["shorts", "/shorts/aqz-KE-bpKQ"],
];

for (const [name, path] of routes) {
  test(`${name} route loads without a reload loop or error flood`, async ({ context }) => {
    const { page, consoleErrors, pageErrors } = await openYouTube(context, path);
    let navigations = 0;
    page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    await expect(page.locator("body")).toBeVisible();
    await page.waitForTimeout(3_000);
    expect(navigations).toBeLessThan(3);
    expect(majorErrors(consoleErrors, pageErrors).length).toBeLessThan(10);
  });
}

test("clean profile exercises the signed-out baseline", async ({ context }) => {
  const { page } = await openYouTube(context);
  const cookies = await context.cookies("https://www.youtube.com");
  expect(cookies.some(({ name }) => ["SAPISID", "__Secure-3PAPISID"].includes(name))).toBe(false);
  await expect(page.locator("body")).toBeVisible();
});

test("optional persistent profile exercises the signed-in baseline", async ({ context }) => {
  test.skip(!SIGNED_IN_PROFILE, "Set ORIGINMATRIX_YOUTUBE_USER_DATA_DIR to a dedicated signed-in test profile.");
  const { page } = await openYouTube(context);
  await expect(page.locator("button#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn")).toBeVisible();
});
