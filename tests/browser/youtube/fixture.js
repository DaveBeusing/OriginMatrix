import { test as base, chromium } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { summarizeYouTubeTelemetry } from "../../../src/diagnostics/youtube-telemetry.js";

const extensionPath = resolve(import.meta.dirname, "../../..");

export const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = process.env.ORIGINMATRIX_YOUTUBE_USER_DATA_DIR
      ? resolve(process.env.ORIGINMATRIX_YOUTUBE_USER_DATA_DIR)
      : await mkdtemp(join(tmpdir(), "originmatrix-youtube-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: process.env.ORIGINMATRIX_BROWSER_CHANNEL ?? "chrome",
      headless: process.env.ORIGINMATRIX_HEADLESS === "1",
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
});

test.skip(process.env.ORIGINMATRIX_YOUTUBE_LIVE !== "1", "Set ORIGINMATRIX_YOUTUBE_LIVE=1 to run live YouTube acceptance tests.");

export const WATCH_URL = process.env.ORIGINMATRIX_YOUTUBE_WATCH_URL ?? "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
export const SIGNED_IN_PROFILE = Boolean(process.env.ORIGINMATRIX_YOUTUBE_USER_DATA_DIR);

export async function openYouTube(context, path = "/") {
  const page = context.pages()[0] ?? await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(new URL(path, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" });
  return { page, consoleErrors, pageErrors };
}

export function majorErrors(consoleErrors, pageErrors) {
  const ignored = /favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED|Failed to load resource/i;
  return [...consoleErrors, ...pageErrors].filter((message) => !ignored.test(message));
}

export async function attachYouTubeTelemetry(context, testInfo, { scenario, observations = [], playback = {} }) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const response = await worker.evaluate(() => chrome.runtime.sendMessage({ type: "GET_DASHBOARD_STATE" }));
  if (!response?.ok) throw new Error(response?.error ?? "OriginMatrix telemetry is unavailable.");
  const telemetry = summarizeYouTubeTelemetry({
    scenario,
    accountState: SIGNED_IN_PROFILE ? "signed_in" : "signed_out",
    observations,
    playback,
    performance: { ...response.performance, ...response.statistics, ...response.diagnostics },
  });
  await testInfo.attach("youtube-telemetry", { body: JSON.stringify(telemetry, null, 2), contentType: "application/json" });
  return telemetry;
}
