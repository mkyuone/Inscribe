const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests",
  timeout: 45000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true
  },
  webServer: {
    command: "python3 scripts/serve.py --port 4173",
    port: 4173,
    reuseExistingServer: true,
    timeout: 30000
  }
});
