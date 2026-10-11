import { building } from "$app/env";

import { getDb } from "#lib/server/db/index.ts";

export const init = () => {
  if (!building) getDb();
};
