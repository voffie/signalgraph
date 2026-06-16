import type * as Consumer from "./Consumer.ts";
import type * as Message from "./Message.ts";

export type AnyMessage = Message.Message<string, unknown>;
export type AnyConsumer = Consumer.Consumer<string, AnyMessage>;

export interface Topology<
  TConsumers extends ReadonlyArray<AnyConsumer>
> {
  readonly _tag: "Topology";
  readonly consumers: TConsumers;
}

export interface GraphEdge {
  readonly message: AnyMessage;
  readonly consumer: AnyConsumer;
}

export const make = <
  const TConsumers extends ReadonlyArray<AnyConsumer>
>(options: {
  readonly consumers: TConsumers;
}): Topology<TConsumers> => ({
  _tag: "Topology",
  consumers: options.consumers
});

export const consumers = <
  TConsumers extends ReadonlyArray<AnyConsumer>
>(
  topology: Topology<TConsumers>
): TConsumers => topology.consumers;

export const messages = <
  TConsumers extends ReadonlyArray<AnyConsumer>
>(
  topology: Topology<TConsumers>
): ReadonlyArray<AnyMessage> =>
  topology.consumers.map((consumer) => consumer.message);

export const graph = <
  TConsumers extends ReadonlyArray<AnyConsumer>
>(
  topology: Topology<TConsumers>
): ReadonlyArray<GraphEdge> =>
  topology.consumers.map((consumer) => ({
    message: consumer.message,
    consumer
  }))
