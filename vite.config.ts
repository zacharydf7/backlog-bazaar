import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// A unique id per deploy: the Git commit on Vercel, otherwise a build timestamp.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? String(Date.now());

// Emit a tiny version.json into the build output. The running app polls it and
// prompts a refresh when it sees a newer id than the one baked into its bundle.
function emitVersion(): Plugin {
  return {
    name: "emit-version",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify({ version: buildId }),
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), emitVersion()],
  define: {
    __APP_VERSION__: JSON.stringify(buildId),
  },
});
