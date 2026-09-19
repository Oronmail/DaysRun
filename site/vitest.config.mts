// site/vitest.config.mts — resolves "@/*" to match tsconfig.json's own paths, so a test may import any component that uses
// the site's usual alias (several already did, e.g. FleetMap.tsx and Tips.tsx; nothing had exercised the path until now).
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": here } },
});
