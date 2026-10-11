import { building } from "$app/env";
import { defineEnvVars } from "@sveltejs/kit/env";

export const variables = defineEnvVars({
  DATABASE_PATH: {
    description: "Absolute path to the devtools SQLite file, set by the launcher",
    schema: (value) => {
      if (value) return value;
      if (building) return "";
      if (import.meta.env.DEV) return ".dev/devtools.db";
      throw new Error("DATABASE_PATH must be set");
    }
  }
});
