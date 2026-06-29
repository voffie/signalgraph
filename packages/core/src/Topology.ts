import type * as Consumer from "./Consumer.ts";
import type * as Message from "./Message.ts";

export interface Topology<
  TConsumers extends ReadonlyArray<Consumer.AnyConsumer>
> {
  readonly _tag: "Topology";
  readonly consumers: TConsumers;
}

export interface GraphEdge {
  readonly message: Message.AnyMessage;
  readonly consumer: Consumer.AnyConsumer;
}

export const make = <
  const TConsumers extends ReadonlyArray<Consumer.AnyConsumer>
>(options: {
  readonly consumers: TConsumers;
}): Topology<TConsumers> => ({
  _tag: "Topology",
  consumers: options.consumers
});

export const consumers = <
  TConsumers extends ReadonlyArray<Consumer.AnyConsumer>
>(
  topology: Topology<TConsumers>
): TConsumers => topology.consumers;

export const messages = <
  TConsumers extends ReadonlyArray<Consumer.AnyConsumer>
>(
  topology: Topology<TConsumers>
): ReadonlyArray<Message.AnyMessage> =>
  topology.consumers.map((consumer) => consumer.message);

export const graph = <
  TConsumers extends ReadonlyArray<Consumer.AnyConsumer>
>(
  topology: Topology<TConsumers>
): ReadonlyArray<GraphEdge> =>
  topology.consumers.map((consumer) => ({
    message: consumer.message,
    consumer
  }))
