import * as path from "node:path";

import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";

const exclude = ["**/.*/**", "**/node_modules/**", "**/dist/**", "**/*.config.*", "**/vitest.*"];

const shared: ViteUserConfig = {
  server: {
    watch: {
      ignored: exclude
    }
  },
  resolve: {
    tsconfigPaths: true
  },
  test: {
    exclude,
    setupFiles: [path.join(import.meta.dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: false
    },
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["html"],
      reportsDirectory: "coverage",
      exclude
    }
  }
};

const project = (name: string, root: string, include = ["test/**/*.test.ts"]) =>
  mergeConfig(shared, { root, test: { name, include } });

export default defineConfig({
  test: {
    projects: [
      project("signalgraph", "packages/signalgraph"),
      project("@signalgraph/devtools", "packages/devtools", ["src/lib/test/**/*.test.ts"]),
      project("@signalgraph/adapter-rabbitmq", "packages/adapter/rabbitmq"),
      project("@signalgraph/adapter-cloudflare", "packages/adapter/cloudflare")
    ]
  }
});
