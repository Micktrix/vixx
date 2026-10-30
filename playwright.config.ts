import { defineConfig, devices } from "@playwright/test";

// Kræver lokal Supabase med seed (npm run db:reset). Testene opretter egne brugere,
// så de kan køres flere gange uden reset.
export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    locale: "da-DK",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
