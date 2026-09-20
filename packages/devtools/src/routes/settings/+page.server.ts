import { getGraphLookbackSeconds, saveGraphLookbackSeconds } from "$lib/server/db/appSettings";
import {
  createDataSource,
  deleteDataSource,
  getActiveDataSource,
  getDataSourceByName,
  listDataSources,
  setActiveDataSource,
  updateDataSource,
} from "$lib/server/db/dataSource";
import { isTraceVendor } from "$lib/telemetry/traces";
import { fail } from "@sveltejs/kit";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => {
  return {
    dataSources: listDataSources(),
    graphLookbackSeconds: getGraphLookbackSeconds(),
  };
};

export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();
    const currentName = (form.get("currentName") as string | null) ?? null;
    const name = (form.get("name") as string)?.trim();
    const vendor = form.get("vendor") as string;
    const url = form.get("url") as string;

    if (!name) {
      return fail(400, { action: "save" as const, error: "Connection name is required." });
    }

    if (!isTraceVendor(vendor)) {
      return fail(400, { action: "save" as const, error: "Unknown vendor." });
    }

    if (!url) {
      return fail(400, { action: "save" as const, error: "Vendor URL is required." });
    }

    const conflict = getDataSourceByName(name);
    if (conflict && name !== currentName) {
      return fail(400, {
        action: "save" as const,
        error: "A connection with that name already exists.",
      });
    }

    if (currentName) {
      updateDataSource(currentName, { name, vendor, config: { url } });
    } else {
      createDataSource({ name, vendor, config: { url } });
      if (!getActiveDataSource()) setActiveDataSource(name);
    }

    return { action: "save" as const, success: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const name = form.get("name") as string;

    if (!name) {
      return fail(400, { action: "delete" as const, error: "Missing connection name." });
    }

    deleteDataSource(name);

    return { action: "delete" as const, success: true };
  },

  setActive: async ({ request }) => {
    const form = await request.formData();
    const name = form.get("name") as string;

    if (!name) {
      return fail(400, { action: "setActive" as const, error: "Missing connection name." });
    }

    setActiveDataSource(name);
    return { action: "setActive" as const, success: true };
  },

  saveGraphLookback: async ({ request }) => {
    const form = await request.formData();
    const seconds = Number(form.get("lookbackSeconds"));

    if (!Number.isFinite(seconds) || seconds <= 0) {
      return fail(400, {
        action: "saveGraphLookback" as const,
        error: "Please choose a valid lookback window.",
      });
    }

    saveGraphLookbackSeconds(seconds);
    return { action: "saveGraphLookback" as const, success: true };
  },
};
