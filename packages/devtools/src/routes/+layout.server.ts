import { getDataSourceConfig } from "$lib/server/db/dataSource";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = () => {
  const config = getDataSourceConfig();
  return {
    hasDataSource: config !== null,
    dataSourceType: config?.type ?? null,
  };
};
