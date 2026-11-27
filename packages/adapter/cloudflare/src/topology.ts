import { Duration, Effect, Option, Schema } from "effect";
import type { AnyConsumer } from "signalgraph";
import { InitializationError, type MessageGraph } from "signalgraph/runtime";

/** Binding names reserved for SignalGraph queue producers. */
export type CloudflareQueueBindingName = `SIGNALGRAPH_QUEUE_${string}`;

/** Binding names that carry the physical queue name into the Worker. */
export type CloudflareQueueNameBinding = `SIGNALGRAPH_QUEUE_NAME_${string}`;

/** The validated deployment and delivery settings for one SignalGraph consumer. */
export interface CloudflareQueue {
  readonly consumer: AnyConsumer;
  readonly binding: CloudflareQueueBindingName;
  readonly nameBinding: CloudflareQueueNameBinding;
  /** The first element is the delay after initial delivery fails. */
  readonly retryDelays: ReadonlyArray<number>;
}

const maxRetries = 100;
const maxDelaySeconds = 86_400;
const decodeDelay = Schema.decodeEffect(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: maxDelaySeconds })));

const delayInSeconds = (input: Duration.Input) =>
  Duration.fromInput(input).pipe(Option.filter(Duration.isFinite), Option.map(Duration.toSeconds));

const queueRetryDelays = Effect.fn(function* (consumer: AnyConsumer) {
  const retry = Option.fromUndefinedOr(consumer.retry);

  if (Option.isNone(retry)) return [];

  const policy = retry.value;

  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1 || policy.maxAttempts > maxRetries + 1) {
    return yield* new InitializationError({
      cause: { operation: "configureQueue", consumer: consumer.name, field: "retry.maxAttempts" },
      message: `Cannot configure the Cloudflare queue for "${consumer.name}". Set maxAttempts to an integer from 1 to 101.`
    });
  }

  const initial = delayInSeconds(policy.type === "fixed" ? policy.delay : policy.initialDelay);

  if (Option.isNone(initial)) {
    return yield* new InitializationError({
      cause: { operation: "configureQueue", consumer: consumer.name, field: "retry.delay" },
      message: `Cannot configure the Cloudflare queue for "${consumer.name}". Set the initial retry delay to a finite duration.`
    });
  }

  const factor = policy.type === "fixed" ? 1 : (policy.factor ?? 2);

  if (!Number.isFinite(factor) || factor < 1) {
    return yield* new InitializationError({
      cause: { operation: "configureQueue", consumer: consumer.name, field: "retry.factor" },
      message: `Cannot configure the Cloudflare queue for "${consumer.name}". Set the retry factor to a finite number of at least 1.`
    });
  }

  const maximum = policy.type === "exponential" ? Option.fromUndefinedOr(policy.maxDelay) : Option.none();
  let cap = Infinity;

  if (Option.isSome(maximum)) {
    const seconds = delayInSeconds(maximum.value);

    if (Option.isNone(seconds)) {
      return yield* new InitializationError({
        cause: { operation: "configureQueue", consumer: consumer.name, field: "retry.maxDelay" },
        message: `Cannot configure the Cloudflare queue for "${consumer.name}". Set maxDelay to a finite duration.`
      });
    }

    cap = seconds.value;
  }

  const delays: Array<number> = [];

  for (let index = 0; index < policy.maxAttempts - 1; index++) {
    const exponential = initial.value === 0 ? 0 : initial.value * Math.pow(factor, index);
    const seconds = Math.ceil(Math.min(exponential, cap));

    const delay = yield* decodeDelay(seconds).pipe(
      Effect.catchTag("SchemaError", () =>
        Effect.fail(
          new InitializationError({
            cause: { operation: "configureQueue", consumer: consumer.name, field: "retry.delay" },
            message: `Cannot configure the Cloudflare queue for "${consumer.name}". Set retry delays or maxDelay so every retry is within 24 hours.`
          })
        )
      )
    );

    delays.push(delay);
  }

  return delays;
});

/** Derives Cloudflare bindings and retry settings from the generated graph. */
export const deriveCloudflareQueueTopology: (
  graph: MessageGraph
) => Effect.Effect<ReadonlyArray<CloudflareQueue>, InitializationError> = Effect.fn(function* (graph: MessageGraph) {
  const queues: Array<CloudflareQueue> = [];
  const bindings = new Set<CloudflareQueueBindingName>();
  const consumers = Object.values(graph).flatMap(({ consumers }) => consumers);

  for (const consumer of consumers) {
    const suffix = consumer.name.toUpperCase().replaceAll(/[^A-Z0-9]/g, "_");
    const binding: CloudflareQueueBindingName = `SIGNALGRAPH_QUEUE_${suffix}`;
    const nameBinding: CloudflareQueueNameBinding = `SIGNALGRAPH_QUEUE_NAME_${suffix}`;
    const conflict = Option.fromUndefinedOr([binding, nameBinding].find((name) => bindings.has(name)));

    if (Option.isSome(conflict)) {
      return yield* new InitializationError({
        cause: { operation: "configureQueue", consumer: consumer.name, binding: conflict.value, field: "name" },
        message: `Cannot configure the Cloudflare queue for "${consumer.name}". Binding "${conflict.value}" is already in use. Rename one of the consumers to give their bindings distinct names.`
      });
    }

    if (consumer.prefetch !== undefined && consumer.prefetch !== 0) {
      return yield* new InitializationError({
        cause: { operation: "configureQueue", consumer: consumer.name, field: "prefetch" },
        message: `Cannot configure the Cloudflare queue for "${consumer.name}". Omit prefetch for Cloudflare Queues.`
      });
    }

    queues.push({
      consumer,
      binding,
      nameBinding,
      retryDelays: yield* queueRetryDelays(consumer)
    });
    bindings.add(binding);
    bindings.add(nameBinding);
  }

  return queues;
});
