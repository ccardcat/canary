import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  workers: 2,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", {open:"never"}]] : "list",
  use: {
    baseURL: "http://127.0.0.1:1420",
    viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.BROWSER_EXECUTABLE_PATH },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: true,
  },
});

