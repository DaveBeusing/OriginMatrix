import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser/youtube",
  testMatch: "**/*.spec.js",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["json", { outputFile: "test-results/youtube/results.json" }]],
  outputDir: "test-results/youtube/artifacts",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
