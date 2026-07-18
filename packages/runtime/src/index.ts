export interface Message<P> {
  publish(payload: P): void;
}

export interface Consumer<P> {
  handle(
    handler: (ctx: {
      readonly payload: P;
    }) => void
  ): void;
}

export type Routing = Record<string, readonly string[]>;

type ClientShape = Record<
  string,
  Message<unknown> | Consumer<unknown>
>;

export function createClient<T extends ClientShape>(routing: Routing): T {
  const handlers = new Map<
    string, Array<(ctx: {
      readonly payload: unknown;
    }) => void>
  >();

  const client: Record<string, unknown> = {};

  for (const [message, consumers] of Object.entries(routing)) {
    client[message] = {
      publish(payload: unknown) {
        for (const consumer of consumers) {
          const list = handlers.get(consumer);

          if (!list) continue;

          for (const handler of list) {
            handler({
              payload
            });
          }
        }
      }
    };
  }

  const consumerNames = new Set(Object.values(routing).flat());

  for (const consumer of consumerNames) {
    client[consumer] = {
      handle(handler: Handler) {
        const list = handlers.get(consumer) ?? [];

        list.push(handler);

        handlers.set(consumer, list);
      }
    };
  }

  return client as T;
}
