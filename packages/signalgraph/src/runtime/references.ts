import { Context, Option } from "effect";

import type { MessageMetadata } from "./metadata.ts";

/** Carries inbound correlation through effects started by the current handler. */
export const CurrentMessageMetadata = Context.Reference<Option.Option<MessageMetadata>>(
  "@signalgraph/runtime/CurrentMessageMetadata",
  {
    defaultValue: Option.none
  }
);
