import { afterAll, afterEach, beforeAll, describe, expect, it } from "@effect/vitest";
import { RabbitMQBroker } from "@signalgraph/adapter-rabbitmq";
import { RabbitMQContainer, type StartedRabbitMQContainer } from "@testcontainers/rabbitmq";
import { ToxiProxyContainer, type StartedToxiProxyContainer } from "@testcontainers/toxiproxy";
import { Deferred, Effect, Exit, Fiber } from "effect";
import { Network, type StartedNetwork } from "testcontainers";

import { makeClient } from "./helpers.ts";

type Proxy = Awaited<ReturnType<StartedToxiProxyContainer["createProxy"]>>;

type BrokerOptions = Omit<Parameters<typeof RabbitMQBroker>[0], "url">;

describe("RabbitMQBroker over an unreliable network", () => {
  let network: StartedNetwork;
  let rabbitmq: StartedRabbitMQContainer;
  let toxiproxy: StartedToxiProxyContainer;
  let proxy: Proxy;

  const control = () => `http://${toxiproxy.getHost()}:${toxiproxy.getMappedPort(8474)}`;
  const toxicsUrl = () => `${control()}/proxies/rabbitmq/toxics`;

  // A bandwidth of zero in both directions: the TCP connection stays open but nothing flows,
  // which is the "silent" failure that only heartbeats can detect
  async function addBlackhole() {
    for (const stream of ["upstream", "downstream"]) {
      await fetch(toxicsUrl(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: `cut-${stream}`, type: "bandwidth", stream, toxicity: 1, attributes: { rate: 0 } })
      });
    }
  }

  async function removeBlackhole() {
    for (const stream of ["upstream", "downstream"]) {
      await fetch(`${toxicsUrl()}/cut-${stream}`, { method: "DELETE" });
    }
  }

  const broker = (extra: BrokerOptions = {}) =>
    RabbitMQBroker({
      url: `amqp://guest:guest@${proxy.host}:${proxy.port}`,
      reconnect: { initialDelay: "100 millis", maxDelay: "1 second" },
      ...extra
    });

  beforeAll(async () => {
    network = await new Network().start();
    rabbitmq = await new RabbitMQContainer("rabbitmq:4.1-management")
      .withNetwork(network)
      .withNetworkAliases("rabbitmq")
      .start();
    toxiproxy = await new ToxiProxyContainer("ghcr.io/shopify/toxiproxy:2.12.0").withNetwork(network).start();
    proxy = await toxiproxy.createProxy({ name: "rabbitmq", upstream: "rabbitmq:5672" });
  }, 120000);

  afterEach(async () => {
    await removeBlackhole();
    await proxy.setEnabled(true);
  });

  afterAll(async () => {
    await toxiproxy?.stop();
    await rabbitmq?.stop();
    await network?.stop();
  });

  it.live(
    "a publish waits through an outage and succeeds once the broker is reachable again",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;
        const received = yield* Deferred.make<number>();

        yield* client.analytics.handle(({ payload }) => Deferred.succeed(received, payload.orderId));
        yield* client.start();

        yield* Effect.promise(() => proxy.setEnabled(false));
        yield* Effect.sleep("1 second"); // the drop is noticed and reconnecting has started to fail

        const publishing = yield* Effect.forkChild(client.orderCreated.publish({ orderId: 7 }));
        yield* Effect.sleep("1 second"); // the publish is now waiting for a session

        yield* Effect.promise(() => proxy.setEnabled(true));

        yield* Fiber.join(publishing);
        expect(yield* Deferred.await(received)).toBe(7);
      }).pipe(Effect.provide(broker())),
    60000
  );

  it.live(
    "a publish fails when the connection does not come back within publishWaitTimeout",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;

        yield* client.start();

        yield* Effect.promise(() => proxy.setEnabled(false));
        yield* Effect.sleep("1 second");

        const exit = yield* Effect.exit(client.orderCreated.publish({ orderId: 1 }));
        expect(Exit.isFailure(exit)).toBe(true);
      }).pipe(Effect.provide(broker({ publishWaitTimeout: "500 millis" }))),
    60000
  );

  it.live(
    "detects a connection that silently stops answering, using heartbeats",
    () =>
      Effect.gen(function* () {
        const client = yield* makeClient;

        const started = yield* Deferred.make<void>();
        const redelivered = yield* Deferred.make<void>();
        let invocations = 0;
        let interrupted = false;

        yield* client.analytics.handle(() =>
          Effect.suspend(() => {
            invocations += 1;

            if (invocations === 1) {
              return Deferred.succeed(started, undefined).pipe(
                Effect.andThen(Effect.never),
                Effect.ensuring(
                  Effect.sync(() => {
                    interrupted = true;
                  })
                )
              );
            }

            return Deferred.succeed(redelivered, undefined);
          })
        );

        yield* client.start();
        yield* client.orderCreated.publish({ orderId: 1 });
        yield* Deferred.await(started);

        yield* Effect.promise(addBlackhole);

        // No close event ever fires. With a 1 second heartbeat the client gives up after about 2-3 seconds.
        for (let i = 0; i < 100; i++) {
          yield* Effect.sleep("100 millis");

          if (interrupted) break;
        }

        expect(interrupted).toBe(true);

        yield* Effect.promise(removeBlackhole);
        yield* Deferred.await(redelivered);
        expect(invocations).toBe(2);
      }).pipe(Effect.provide(broker({ heartbeat: 1 }))),
    60000
  );

  it.live(
    "keeps retrying at startup until the broker is reachable",
    () =>
      Effect.gen(function* () {
        yield* Effect.promise(() => proxy.setEnabled(false));

        const up = yield* Deferred.make<void>();
        yield* Effect.forkChild(
          Effect.gen(function* () {
            yield* Deferred.succeed(up, undefined); // only runs once the layer has connected
          }).pipe(Effect.provide(broker()))
        );

        const early = yield* Deferred.await(up).pipe(Effect.timeoutOption("1500 millis"));
        expect(early._tag).toBe("None"); // still retrying, and the process did not fail

        yield* Effect.promise(() => proxy.setEnabled(true));
        yield* Deferred.await(up);
      }),
    60000
  );
});
