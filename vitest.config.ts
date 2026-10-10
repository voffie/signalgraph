import * as path from "node:path";

import { defineConfig, mergeConfig, type ViteUserConfig } from "vitest/config";

const project = (
  name: string,
  directory: string,
  include: boolean = true,
  config: ViteUserConfig = {},
  projectExclude?: ReadonlyArray<string>,
  projectInclude?: ReadonlyArray<string>
) => {
  if (!include) {
    return [];
  }

  const cfg = mergeConfig(
    {
      root: directory,
      test: { name }
    },
    config
  );

  const merged = mergeConfig(shared, cfg);
  if (projectExclude !== undefined) {
    merged.test!.exclude = [...projectExclude];
  }
  if (projectInclude !== undefined) {
    merged.test!.include = [...projectInclude];
  }
  return [merged];
};

export const exclude = ["**/.*/**", "**/node_modules/**", "**/dist/**", "**/*.config.*", "**/vitest.*"];

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
    passWithNoTests: true,
    setupFiles: [path.join(import.meta.dirname, "vitest.setup.ts")],
    sequence: {
      concurrent: true
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

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      ...project("signalgraph", "packages/signalgraph"),
      ...project("@signalgraph/devtools", "packages/devtools"),
      ...project("@signalgraph/adapter-memory", "packages/adapter/memory"),
      ...project("@signalgraph/adapter-rabbitmq", "packages/adapter/rabbitmq")
    ]
  }
});
