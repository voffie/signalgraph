import { Context } from "effect";

import type { MessageMetadata } from "./metadata.ts";

export const CurrentMessageMetadata = Context.Reference<MessageMetadata | undefined>(
  "@signalgraph/runtime/CurrentMessageMetadata",
  {
    defaultValue: () => undefined,
  },
);
