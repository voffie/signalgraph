import path from "node:path";

import aliases from "vite-tsconfig-paths";
import type { ViteUserConfig } from "vitest/config";

const config: ViteUserConfig = {
  plugins: [aliases()],
  test: {
    exclude: ["**/node_modules/**"],
    setupFiles: [path.join(__dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: true,
    },
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "coverage",
      exclude: [
        "node_modules/",
        "dist/",
        "build/",
        "coverage/",
        "**/*.d.ts",
        "**/*.config.ts",
        "**/vitest.setup.*",
        "**/vitest.shared.*",
      ],
    },
  },
};

export default config;
