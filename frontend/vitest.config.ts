// vitest.config.ts
// M1-A test harness. Pinned exact versions: vitest@3.2.7,
// @vitejs/plugin-react@4.7.0, jsdom@30.0.1, @testing-library/react@16.3.2,
// @testing-library/jest-dom@7.0.0 (see package.json devDependencies).
// This harness runs entirely locally (jsdom), makes no network calls, and
// transmits no project code, secrets, or user data externally.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
