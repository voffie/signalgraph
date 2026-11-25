import { fail } from "@sveltejs/kit";
import { Option, Schema } from "effect";

import { getGraphLookbackSeconds, saveGraphLookbackSeconds } from "#lib/server/db/appSettings.js";
import {
  createDataSource,
  deleteDataSource,
  getActiveDataSource,
  getDataSourceByName,
  listDataSources,
  setActiveDataSource,
  updateDataSource
} from "#lib/server/db/dataSource.js";
import { isTraceVendor } from "#lib/telemetry/traces/index.js";

import type { Actions, PageServerLoad } from "./$types";

const decodeFormText = Schema.decodeUnknownOption(Schema.Trim.check(Schema.isNonEmpty()));

const decodeLookback = Schema.decodeUnknownOption(
  Schema.NumberFromString.check(
    Schema.isInt(),
    Schema.isGreaterThan(0),
    Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)
  )
);

const decodeUrl = Schema.decodeUnknownOption(Schema.URLFromString);

/** Loads saved trace connections and the current trace search window. */
export const load: PageServerLoad = () => {
  return {
    dataSources: listDataSources(),
    graphLookbackSeconds: getGraphLookbackSeconds()
  };
};

/** Handles connection changes and lookback settings submitted by the browser. */
export const actions: Actions = {
  save: async ({ request }) => {
    const form = await request.formData();
    const currentName = decodeFormText(form.get("currentName"));
    const name = decodeFormText(form.get("name"));
    const vendor = decodeFormText(form.get("vendor"));
    const url = decodeUrl(form.get("url"));

    if (Option.isNone(name)) {
      return fail(400, { action: "save" as const, error: "Connection name is required." });
    }

    if (Option.isNone(vendor) || !isTraceVendor(vendor.value)) {
      return fail(400, { action: "save" as const, error: "Select a supported trace vendor." });
    }

    if (Option.isNone(url) || !["http:", "https:"].includes(url.value.protocol)) {
      return fail(400, { action: "save" as const, error: "Enter an HTTP or HTTPS URL for the trace connection." });
    }

    const conflict = getDataSourceByName(name.value);

    if (Option.isSome(conflict) && !Option.contains(currentName, name.value)) {
      return fail(409, {
        action: "save" as const,
        error: "A connection with that name already exists."
      });
    }

    const profile = { name: name.value, vendor: vendor.value, config: { url: url.value.href.replace(/\/$/, "") } };

    if (Option.isSome(currentName)) {
      updateDataSource(currentName.value, profile);
    } else {
      createDataSource(profile);

      if (Option.isNone(getActiveDataSource())) setActiveDataSource(name.value);
    }

    return { action: "save" as const, success: true };
  },

  delete: async ({ request }) => {
    const form = await request.formData();
    const name = decodeFormText(form.get("name"));

    if (Option.isNone(name)) {
      return fail(400, { action: "delete" as const, error: "Missing connection name." });
    }

    deleteDataSource(name.value);

    return { action: "delete" as const, success: true };
  },

  setActive: async ({ request }) => {
    const form = await request.formData();
    const name = decodeFormText(form.get("name"));

    if (Option.isNone(name)) {
      return fail(400, { action: "setActive" as const, error: "Missing connection name." });
    }

    if (!setActiveDataSource(name.value)) {
      return fail(404, {
        action: "setActive" as const,
        error: "That connection no longer exists. Refresh the connection list and select another."
      });
    }

    return { action: "setActive" as const, success: true };
  },

  saveGraphLookback: async ({ request }) => {
    const form = await request.formData();
    const seconds = decodeLookback(form.get("lookbackSeconds"));

    if (Option.isNone(seconds)) {
      return fail(400, {
        action: "saveGraphLookback" as const,
        error: "Please choose a valid lookback window."
      });
    }

    saveGraphLookbackSeconds(seconds.value);

    return { action: "saveGraphLookback" as const, success: true };
  }
};
