import { clearDataSourceConfig, getDataSourceConfig, saveDataSourceConfig } from "$lib/server/db/dataSource";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  const config = getDataSourceConfig();
  return {
    type: config?.type ?? null,
    url: config && 'url' in config ? config.url : null
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();

    // TODO: Add a validation part here for the data source (if needed)

    saveDataSourceConfig({
      type: form.get("type") as 'tempo',
      url: form.get('url') as string
    });

    return { success: true };
  },
  disconnect: async () => {
    clearDataSourceConfig();
    return { success: true };
  }
}
