import { defineConfig } from "@playwright/test";

// I test E2E senza backend usano variabili Supabase fittizie: verificano routing, localizzazione e protezione delle rotte.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3100", locale: "it-IT", timezoneId: "Europe/Rome" },
  webServer: {
    command: "npm run build && npx next start -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_dummy",
      BOOKINGS_WEBHOOK_SECRET: "test-secret",
    },
  },
});
