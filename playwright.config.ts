import { defineConfig } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT ?? "5173";
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: "./tests",
  workers: 2,
  timeout: 45000,
  use: { baseURL, channel: "msedge", headless: true },
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
  },
});
