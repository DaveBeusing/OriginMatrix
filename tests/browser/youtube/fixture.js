import { test as base, chromium } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { summarizeYouTubeTelemetry } from "../../../src/diagnostics/youtube-telemetry.js";

const extensionPath = resolve(import.meta.dirname, "../../..");

export const test = base.extend({
  liveGate: [async ({}, use, testInfo) => {
    testInfo.skip(process.env.ORIGINMATRIX_YOUTUBE_LIVE !== "1", "Set ORIGINMATRIX_YOUTUBE_LIVE=1 to run live YouTube acceptance tests.");
    await use();
  }, { auto: true }],
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

export const WATCH_URL = process.env.ORIGINMATRIX_YOUTUBE_WATCH_URL ?? "https://www.youtube.com/watch?v=aqz-KE-bpKQ";
export const SIGNED_IN_PROFILE = Boolean(process.env.ORIGINMATRIX_YOUTUBE_USER_DATA_DIR);

export async function openYouTube(context, path = "/") {
  const page = context.pages()[0] ?? await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(new URL(path, "https://www.youtube.com").href, { waitUntil: "domcontentloaded" });
  await dismissConsent(page);
  return { page, consoleErrors, pageErrors };
}

export async function sendExtensionMessage(context, message, { tabUrl = null } = {}) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).host;
  const extensionPage = await context.newPage();
  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    return await extensionPage.evaluate(async ({ payload, requestedTabUrl }) => {
      if (requestedTabUrl) {
        const tab = (await chrome.tabs.query({})).find(({ url }) => url === requestedTabUrl);
        if (!tab?.id) throw new Error(`Could not find browser tab for ${requestedTabUrl}`);
        payload = { ...payload, tabId: tab.id };
      }
      return chrome.runtime.sendMessage(payload);
    }, { payload: message, requestedTabUrl: tabUrl });
  } finally { await extensionPage.close(); }
}

async function dismissConsent(page) {
  const lightbox = page.locator("ytd-consent-bump-v2-lightbox");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await lightbox.waitFor({ state: "attached", timeout: attempt === 0 ? 15_000 : 4_000 });
    } catch { return; /* Consent is regional and may be absent. */ }
    const reject = lightbox.getByText(/^(Reject all|Alle ablehnen)$/i, { exact: true }).last();
    await reject.scrollIntoViewIfNeeded();
    await reject.click();
    await lightbox.waitFor({ state: "hidden", timeout: 10_000 });
    await page.waitForFunction(() => getComputedStyle(document.body).visibility !== "hidden", null, { timeout: 10_000 });
    await page.waitForTimeout(2_000);
    if (!await lightbox.isVisible()) return;
  }
  throw new Error("YouTube consent dialog repeatedly reopened after rejection.");
}

export function majorErrors(consoleErrors, pageErrors) {
  const ignored = /favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_FAILED|Failed to load resource/i;
  return [...consoleErrors, ...pageErrors].filter((message) => !ignored.test(message));
}

export async function attachYouTubeTelemetry(context, testInfo, { scenario, observations = [], playback = {} }) {
  const response = await sendExtensionMessage(context, { type: "GET_DASHBOARD_STATE" });
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
