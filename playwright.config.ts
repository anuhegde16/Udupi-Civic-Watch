import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright e2e configuration for CleanSpot.
 *
 * The frontend (port 18338) and API (port 8080) must already be running
 * before this suite executes — managed by the configured workflows.
 *
 * Uses the NixOS system Chromium binary — the Playwright-downloaded headless
 * shell is missing shared libraries in this sandboxed environment.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: 1,
  workers: 1, // serial — avoids session collisions on shared dev DB
  globalSetup: "./e2e/global-setup.ts",
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/playwright-report" }]],

  use: {
    // Port 80 is the Replit shared proxy which routes / → 18338 and /api/* → 8080.
    // Direct access to port 18338 bypasses the proxy and breaks /api/* calls.
    baseURL: "http://localhost:80",
    headless: true,
    viewport: { width: 390, height: 844 }, // mobile-first app
    ignoreHTTPSErrors: true,
    storageState: undefined,
    launchOptions: {
      executablePath: "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium",
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
