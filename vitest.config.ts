import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    css: false,
    // Force local (guest) mode during tests so the store never touches Supabase,
    // regardless of what's in .env. Cloud paths are exercised against the real
    // backend manually; unit tests cover the offline state machine.
    env: {
      VITE_SUPABASE_URL: "",
      VITE_SUPABASE_ANON_KEY: "",
      VITE_RAWG_KEY: "",
    },
  },
});
