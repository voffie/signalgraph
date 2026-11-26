# Coding standards

## Monorepo boundaries

Treat every workspace under `apps/*` as an independent runnable or deployable composition root.
An app may depend on external packages and workspaces under `packages/*`; it must never import from,
declare a workspace dependency on, or reach through a relative source path into another app. This
rule applies to production code, scripts, and tests.

Workspaces under `packages/*` contain capabilities shared by apps and must not import from
`apps/*`. Cross-app behavior goes through a real runtime interface such as HTTP, or through a
shared package with an intentional public entrypoint. Cross-app end-to-end test support belongs in
a package rather than importing one app's internals into another app or its tests.

Keep code in its owning app while it has one consumer. When another app needs the same domain,
application service, adapter, infrastructure lifecycle, test utility, or client capability, move
that capability to a cohesive package and have both apps depend on it. Do not create a package
only to anticipate hypothetical reuse.

Apps should become thin entrypoints as shared capabilities emerge: retain process/runtime startup,
framework wiring, app-specific configuration, and final Layer or dependency composition in the
app; place reusable behavior behind package public entrypoints. This is an incremental direction,
not a requirement to relocate existing app-local modules before another owner needs them.

## Provenance and parsing

Choose validation from evidence about the value's origin:

| Input evidence                                                                                                                           | Required handling                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown external or persisted input, including raw SQL rows, native storage, and untyped bodies                                          | Decode from `unknown` with the owning boundary schema into the strongest meaningful type. SQL generic annotations and declaration files are not runtime evidence.         |
| A known encoded representation such as JSON text, a string when the codec's `Encoded` type is `string`, or another declared encoded type | Use a typed decoder only when its input is assignable to that exact encoded type. Validate the contents; otherwise preserve honest boundary decoding rather than casting. |
| An established domain or application value                                                                                               | Pass it unchanged without parsing or representation round trips.                                                                                                          |
| A newly computed constrained value or patched state                                                                                      | Establish the new invariant with the owning constructor, refinement, or schema transformation.                                                                            |

The Adapter that owns an I/O boundary owns its translation and parse errors. Domain Modules and
Application Services receive parsed domain/application values rather than request payloads,
database rows, environment strings, vendor records, or other boundary representations. Encode a
rich value only when crossing an output boundary that requires the encoded representation.

Instantiate a reusable codec once, privately, beside its owner. Expose a domain-named application
parser with the actual input type and a unary signature unless real consumers require additional
domain inputs. A direct export of a `Schema.decode*` factory also exposes library `ParseOptions`, so
it is not the default application API.

At a genuinely unknown boundary, keep unknown decoding private to the Adapter and let the framework
supply the raw input type:

<!-- prettier-ignore -->
```ts
const decodeCreateInvoiceCommand = Schema.decodeUnknownEffect(CreateInvoiceCommand);

const command = yield* decodeCreateInvoiceCommand(requestBody);
return yield* invoiceService.createInvoice(command);
```

For a known encoded string, use a schema whose encoded type is actually `string`, then preserve that
input through a narrow wrapper:

```ts
const InfrastructureStage = Schema.String.check(Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/)).pipe(
  Schema.brand("InfrastructureStage")
);
const decodeInfrastructureStage = Schema.decodeEffect(InfrastructureStage);

export const parseInfrastructureStage = (input: string) => decodeInfrastructureStage(input);
```

`Schema.decodeEffect` accepts the codec's `Encoded` type, not any value that happens to be known. A
raw `string` therefore cannot be passed to a codec whose encoded type is a literal union. Preserve
honest unknown-boundary decoding when the source does not match the encoded type; never cast to
force typed decoding.

A deliberately low-level public codec may expose unknown input or parse options when those are part
of its real contract; document that boundary instead of disguising it with aliases or casts. Typed
decoder substitution changes the function contract but does not by itself remove runtime validation.

## Preserve established type information

Treat types as evidence about where a value came from and which invariants have already been
established. Preserve the strongest meaningful domain, application, library, or platform type
available. A broader type is not safer when the value is already known; it discards evidence and
moves mistakes from the compiler into runtime assumptions.

Never widen a known value to `unknown`, `object`, a primitive, or `Record<string, unknown>` merely
because a downstream implementation is easier to write against a broad type. This applies equally
to project-owned domain values and values returned by typed libraries. Function parameters and
return values state what the function actually accepts and produces, not the broadest structure its
implementation could inspect:

```ts
// Wrong: discards the library's established operation contract.
const transformOperation = (value: Record<string, unknown>): Record<string, unknown> => {
  // ...
};

// Correct: preserves the type supplied by the owning library.
const transformOperation = (operation: OpenApiOperation): OpenApiOperation => {
  // ...
};
```

### Refine known values without widening

Once a boundary has parsed a value, later operations accept that established type. When a
calculation, patch, or combination introduces an additional constraint, transform from the known
source type to a stronger target with its owning constructor or a typed `Schema.decodeTo`
composition. Use `Schema.decodeEffect` so the composed schema's encoded side remains the precise
source type.

Field brands, `satisfies`, and static types do not prove cross-field persisted facts or newly
computed range and state constraints. Retain the runtime refinement that owns those facts. Establish
the stronger value directly rather than constructing or encoding JSON only to parse an existing
domain value again.

Do not expose `Schema.decodeUnknown*`, an `unknown` parameter, or another broad decoder for an
operation whose callers already hold a domain value, parsed command, or other precise type. That
contract discards provenance and turns compiler-rejected mistakes into runtime parse failures.

Prefer, in order, a composed Effect Schema whose source schema owns the established input type, a
typed smart constructor, or a typed refinement function when no source schema exists. Name the
operation for what it does. Use names such as `refineInvoiceTransition` or `toPersistedInvoice` for
operations on already parsed values.

Apply the same rule to encoding and intermediate representations. A known value must not pass through
`unknown`, `object`, a generic record, JSON, or a broader primitive merely to make a transformation
convenient. Preserve the source type until the code crosses a real I/O boundary or establishes a
stronger type directly.

Never erase a type and assert it back later. Chained assertions such as `value as unknown as T`,
`value as any as T`, and equivalent multi-statement widening-and-casting sequences are prohibited.
A type assertion does not parse, validate, or establish an invariant. If code deliberately loses
type information and later reconstructs it with `as`, redesign the boundary.

Reserve `unknown` for values that genuinely cross an untrusted runtime boundary, such as parsed
JSON, HTTP or RPC input, persistence, configuration, files, queues, platform APIs, or untyped
third-party callbacks. Keep the unknown decoder private to the owning Adapter unless callers truly
need a low-level codec API. Application parser wrappers expose the representation callers actually
hold and only the domain inputs they need. Values created by our code, returned by a typed API, or
already parsed are not unknown; preserve their type even when a receiving API is inconvenient.

Parse genuinely unknown input once, at the nearest Adapter, I/O boundary, or composition root, into
the strongest meaningful type. Convert every generic record into a strongly typed domain,
application, protocol, or persistence type at the earliest possible point, as close as possible to
the I/O boundary where the data originated. Inner modules receive the parsed type and must not
repeatedly narrow, inspect, or assert the same external representation. Runtime `typeof` checks and
generic object checks prove only incidental JavaScript representation facts; they do not parse the
expected contract. Parse that contract directly with its schema, decoder, smart constructor, or
other owning parser.

Before introducing `unknown`, `object`, a generic record, a hand-written structural type, or a type
assertion:

1. Identify the value's provenance and whether it is actually untrusted at runtime.
2. Search the owning domain module or library for its public type, schema, decoder, constructor, or
   generic parameter.
3. Preserve that type through function boundaries and use `satisfies`, explicit return types, or
   typed constructors to check newly constructed values without widening them.
4. If the source is genuinely untrusted, parse it at the boundary and pass only the parsed result
   inward.
5. If a library API is typed more broadly than the value it supplies, do not hide the mismatch with
   a cast. Prefer a first-class API, a typed upstream fix or upgrade, an explicitly parsed boundary
   adapter, or omission of unsupported behavior.

A type assertion is permitted only at the smallest unavoidable platform boundary when the runtime
invariant has already been established but TypeScript cannot express it. The value must not have
been widened by our own code; the assertion must not chain through `unknown` or `any`; and the
upstream limitation, runtime evidence, and focused verification must be documented. Convenience,
framework folklore, and "this callback always passes that type" are not evidence.

### `SAFETY` assertions inside library internals

Library internals can use an assertion that improves the public API when TypeScript cannot express
the invariant. For example, an assertion can preserve type inference or keep internal parameters
out of public signatures. This exception applies only to library internals. It includes a chain
through `unknown` when TypeScript reports that the types do not overlap. Each such assertion must carry, directly above it:

- a `// SAFETY:` comment proving the runtime value has the asserted type: where the value comes
  from, which invariant guarantees it, and why TypeScript cannot see that invariant;
- a `Verified by:` line naming the test or tests that fail if the invariant breaks; and
- the narrowest lint suppression for exactly the rules that fire (for example
  `// oxlint-disable-next-line typescript/consistent-type-assertions`).

Keep each assertion to a single expression, as close to the value's origin as possible. An
assertion without all three is still a review blocker.

Use precise owner-provided types or generics instead of `any`, and branch or refine optional values
before use instead of applying a non-null assertion. Treat ordinary explicit `any` and non-null
assertions as review blockers. An unavoidable platform-boundary exception follows the same smallest-
owner, runtime-evidence, safety-comment, and focused-verification requirements as an assertion, plus
any targeted suppression required by the configured lint policy.

Treat the following as review blockers:

- `as unknown as` or `as any as`, outside a library-internal `SAFETY` assertion (see above);
- a known domain or library value accepted or returned as `unknown`, `object`, or a generic record;
- an assertion immediately following an explicit widening assignment;
- repeated parsing or narrowing of a value that already crossed its owning boundary;
- a generic record guard used in place of parsing the expected contract;
- a local approximation of an available domain or library type;
- an internal function returning `unknown` without introducing a new external boundary.

The governing rule is: **preserve evidence already established, create evidence by parsing truly
unknown input at its boundary, and never fabricate evidence with an assertion after throwing it
away.**

## Schema testing

Do not add tests that merely restate a schema's declared constraints with representative valid or
invalid values. Schema libraries own their decoding mechanics, and the schema declaration itself is
the specification for straightforward brands, structs, and unions.

Add schema-focused tests only when they verify application-owned behavior beyond the declaration,
such as a transformation, normalization, custom filter, compatibility contract, encoded/decoded
round trip, or a previously regressed edge case. Test boundary behavior through the boundary's
public interface when parsing failures produce caller-visible application or protocol outcomes.

## Optional values

Represent every optional field, property, parameter, and return value with `Option.Option<A>`.

Do not represent optional values inside the application as `null`, `undefined`, `A | null`, `A | undefined`, or optional object properties. Decode nullable or optional external input into `Option` at the boundary, and encode it back only when an external contract requires `null`, `undefined`, or an omitted property.

```ts
import { Option } from "effect";

type Invoice = {
  body: Option.Option<string>;
};

const withBody = Option.some("Invoice details");
const withoutBody = Option.none<string>();
```

## Effect imports

Import stable Effect modules as named namespace exports from the `effect` package root. Combine
multiple stable modules in one declaration:

```ts
import { Config, Effect } from "effect";
```

Import unstable modules as named namespace exports from their narrow public package entrypoint:

```ts
import { HttpServerResponse } from "effect/unstable/http";
```

Do not use direct leaf-module namespace imports such as `import * as Effect from "effect/Effect"`.
Use the same import form consistently in source files and tests.

## Error design

Treat errors as product interfaces and observability data. Every error must explain what operation or outcome failed and give the most specific safe reason known. Tell the caller how to correct, retry, reconcile, or escalate the failure; provide reassurance only when the application can prove what was unaffected. Use calm, direct language without blame, jokes, generic fallback copy, or implementation jargon.

Carry diagnostic context as typed fields rather than burying it in prose. Include the operation, safe domain identifiers, a classified reason, recovery or retry information, and a public request identifier where applicable. Public errors use stable literal codes and variant-specific detail schemas. Internal errors retain richer safe context and causes for traces while public adapters redact secrets and implementation details.

Read [`docs/errors.md`](errors.md) before adding or changing typed errors, rendered error messages, public error schemas, HTTP error statuses, retry guidance, or failure telemetry. It is the source of truth for error principles, internal/public boundaries, contextual data, and the error review checklist.

## Effect code style

Use `Effect.gen(function* () { ... })` and `yield*` for business workflows. A generator is the
default when an operation retrieves contextual services, performs multiple dependent steps, names
intermediate results, branches, loops, or returns early. Keep those decisions visible as ordinary
control flow instead of encoding them as chains of `Effect.map`, `Effect.flatMap`, or
`Effect.andThen`.

Use `.pipe(...)` for declarative composition around a workflow and for a single simple transform.
Appropriate pipe combinators include error translation and recovery, retries, timeouts, tracing,
logging annotations, dependency provision, Layer construction, and a direct `Effect.map` that does
not introduce another Effectful step or business decision. Do not introduce a generator merely to
replace one clear transformation.

Combine the styles by keeping business logic inside and cross-cutting policy outside:

```ts
const fetchUserPosts = Effect.fn("UserService.fetchUserPosts")(
  function* (userId: UserId) {
    const database = yield* UserDatabase;
    const cache = yield* UserCache;
    const cachedPosts = yield* cache.getUserPosts(userId);

    if (Option.isSome(cachedPosts)) return cachedPosts.value;

    const posts = yield* database.findPostsByUser(userId);
    yield* cache.setUserPosts(userId, posts);
    return posts;
  },
  Effect.withSpan("UserService.fetchUserPosts"),
  Effect.retry(userPostsRetryPolicy)
);
```

When `Effect.fn` accepts whole-function transforms, pass pipeable cross-cutting combinators after
the generator as shown. Within a generator, a yielded Effect may still use `.pipe(...)` for a
localized error translation or simple result transform. If that pipe begins coordinating further
Effectful operations or branching on domain outcomes, move the coordination into the surrounding
generator.

Apply this decision matrix:

- dependency retrieval, sequential operations, and conditional business logic: `Effect.gen` or a
  generator-based `Effect.fn`;
- error handling, retry, timeout, tracing, logging, dependency provision, and Layer composition:
  `.pipe(...)` or `Effect.fn` whole-function transforms;
- one pure result transformation: `.pipe(Effect.map(...))`;
- multiple dependent `map` / `flatMap` / `andThen` steps: rewrite as a generator so intermediate
  values and control flow are explicit.

## Effect tagged error translation

Prefer `Effect.catchTag` or `Effect.catchTags` when translating an error channel whose expected
failures have `_tag` discriminants. List each known source error explicitly, preserve an
already-correct application error by failing with that same value, and translate each boundary
error according to its tag:

```ts
operation.pipe(
  Effect.catchTags({
    RegisterAccountError: (error) => Effect.fail(error),
    SchemaError: () =>
      Effect.fail(
        new RegisterAccountError({
          reason: "StoredDataInvalid",
          message: "Account registry failed to register Account"
        })
      ),
    SqlError: () =>
      Effect.fail(
        new RegisterAccountError({
          reason: "PersistenceFailed",
          message: "Account registry failed to register Account"
        })
      )
  })
);
```

Do not use `instanceof` branches or a broad `Effect.mapError` to distinguish tagged expected
failures. Do not add a catch-all translation that silently classifies future error types. Leaving
an unhandled tag in the inferred error channel is intentional: a newly introduced failure must
produce a type error until its translation policy is chosen. `Effect.mapError` remains appropriate
when the complete error channel intentionally has one meaning and no tag-specific policy is being
lost.

When an `Effect.fn` whole-function transform is already a pipeable combinator, pass it directly.
Do not wrap it in `(effect) => effect.pipe(...)`:

```ts
const registerAccount = Effect.fn("AccountRegistry.registerAccount")(
  function* (account: Account) {
    return yield* registry.registerAccount(account);
  },
  Effect.catchTags({
    RegisterAccountError: (error) => Effect.fail(error),
    SchemaError: () => Effect.fail(new RegisterAccountError({ reason: "StoredDataInvalid" })),
    HttpClientError: () => Effect.fail(new RegisterAccountError({ reason: "PersistenceFailed" }))
  })
);
```

Use a callback transform only when composing multiple combinators or when the transform needs the
original function arguments.

## Effect service dependencies in Layers

When a Layer or framework builder depends on a contextual Effect service, yield that service inside
the Effect that constructs the Layer's implementation. Keep the service in the Layer requirement
channel until the composition root selects its implementation with `Layer.provide`.

Export a Layer value with the dependency requirement instead of a factory that accepts the service
as a plain function argument:

```ts
/** Account HTTP handlers backed by the contextual Account database. */
export const accountHttpHandlersLayer = HttpApiBuilder.group(AccountHttpApi, "account", (handlers) =>
  Effect.gen(function* () {
    const database = yield* AccountDatabase;

    return handlers.handle("getAccount", () => database.getAccount());
  })
);

const configuredAccountHttpHandlersLayer = accountHttpHandlersLayer.pipe(Layer.provide(accountDatabaseLayer));
```

Do not manually yield a contextual service in an outer Effect solely to pass it into a
`make<CapabilityName>Layer(service)` function. Plain arguments remain appropriate for parsed request
or domain values, external constructor options, and capabilities whose behavior is genuinely
higher-order rather than an Effect service.

Tests follow the same requirement channel: provide a faithful implementation with `Layer.succeed`
or a test Layer, then provide that Layer to the dependency-preserving Layer under test.

## Effect service modules

### Service constructor locality

Do not pass dependency-bearing constructor functions through application code or import them into
runtime composition modules. In an Effect project, an exported free function named
`make<CapabilityName>` is reserved for constructing the contextual service declared in the same
capability module.

The owning service module may use its constructor to define dependency-preserving and ready Layers.
All non-test consumers import those Layers, yield the contextual service, and allow requirements to
propagate to the composition root. They must not import or invoke the constructor directly. Only
files matching the repository's test conventions (`*.test.*` and `*.spec.*`) may import an exported
service constructor, and only when focused verification genuinely needs to exercise construction
without the ready Layer.

```ts
// invoice-service.ts
export const makeInvoiceService = Effect.gen(function* () {
  const invoiceStore = yield* InvoiceStore;
  return InvoiceService.of({/* operations */});
});

export const invoiceServiceLayerWithoutDependencies = Layer.effect(InvoiceService, makeInvoiceService);

// Runtime modules import the Layer and yield InvoiceService. They never import makeInvoiceService.
```

Do not introduce exported `make<X>` functions for dependency bundles, runtime registries, test
setup capabilities, or alternate manual dependency injection. Model them as contextual services
with Layers when they own capabilities or runtime state; keep genuinely pure construction local to
its owning module or expose a domain-named operation that describes the value being derived rather
than a generic constructor seam.

Enforce this with a project lint rule that rejects project-local imports whose imported name matches
`make[A-Z]` unless the importing file matches `*.test.*` or `*.spec.*`. The diagnostic should direct
runtime callers to import the owning Layer and yield the contextual service. Library imports and
schema-owned static constructors such as `AccountName.make` are outside this rule.

Put each new Effect service in a file named for its capability. Keep the service declaration and
its construction in this order:

1. The service shape interface.
2. The contextual service class.
3. The service constructor.
4. The Layer that preserves dependency requirements.
5. The ready production Layer that provides production dependencies.
6. The ready test Layer that provides behaviorally faithful test dependencies.

Every exported symbol must include the capability name rather than relying on its file path for
context. Do not use `Tag` in symbol names. Name constructors `make<CapabilityName>` and use camel
case for Layer values.

A contextual service name does not have to end in `Service`. Use the shortest natural name for the
stable capability. `InvoiceService` is a sensible default when `Service` honestly describes a broad,
cohesive capability; a more specific established name such as `InvoiceStore` is preferable when it
better describes the authority. Apply the same chosen capability name consistently to its interface,
constructor, and Layers. For example, use `IInvoiceStore`, `makeInvoiceStore`, `invoiceStoreLayer`,
and `invoiceStoreTestLayer`.

```ts
/** Defines the Invoice service capability exposed to application callers. */
export interface IInvoiceService {
  readonly findInvoice: (id: InvoiceId) => Effect.Effect<Invoice, InvoiceNotFound>;
}

/** Provides the contextual Invoice service capability. */
export class InvoiceService extends Context.Service<InvoiceService, IInvoiceService>()("@example-svc/InvoiceService") {}

/** Constructs the Invoice service while preserving its dependency requirements. */
export const makeInvoiceService = Effect.gen(function* () {
  const invoiceStore = yield* InvoiceStore;

  return InvoiceService.of({
    findInvoice: Effect.fn("InvoiceService.findInvoice")(function* (id: InvoiceId) {
      return yield* invoiceStore.findInvoice(id);
    })
  });
});

/** Provides the Invoice service without selecting dependency implementations. */
export const invoiceServiceLayerWithoutDependencies = Layer.effect(InvoiceService, makeInvoiceService);

/** Provides the Invoice service with its production dependencies. */
export const invoiceServiceLayer = invoiceServiceLayerWithoutDependencies.pipe(Layer.provide(invoiceStoreLayer));

/** Provides the Invoice service with behaviorally faithful test dependencies. */
export const invoiceServiceTestLayer = invoiceServiceLayerWithoutDependencies.pipe(
  Layer.provide(invoiceStoreTestLayer)
);
```

`<capabilityName>LayerWithoutDependencies` does not mean that the service has no dependencies. It
means the Layer leaves those requirements visible so callers or composition roots can provide
them. `<capabilityName>Layer` selects the complete production dependency graph. If the service has
no production dependencies, still export both canonical names and let the production Layer
reference the dependency-preserving Layer.

A `<capabilityName>TestLayer` must cross the same service interface as production and use complete,
behaviorally honest test implementations. Do not add partial mocks or weaken production behavior
solely to make the test Layer convenient.

## Comments and JSDoc

Every exported JavaScript or TypeScript symbol has JSDoc at its original declaration. A concise comment is sufficient when it states the sharpest caller-visible fact the signature cannot show. Use additional prose or tags only for further constraints, expected failures, side effects, ownership, invariants, trade-offs, non-obvious domain rules, or safety justifications.

Names, public documentation, UI copy, and rendered errors use durable vocabulary appropriate to their audience. Use ordinary domain phrases readers are likely to search for when those phrases differ from an identifier's spelling. Keep ticket names, migration phases, internal storage fields, framework mechanics, and planning language in internal implementation or planning material.

Public methods and properties of an exported class also require JSDoc. Document private/internal code when safe maintenance depends on a non-obvious purpose, invariant, domain rule, side effect, trade-off, or safety justification.

Document each original declaration once; re-exports rely on that documentation. Write explicit documentation in place of inheritance tags such as `@inheritDoc`.

Attach `/** ... */` JSDoc directly to its declaration. Include tags when they add caller-relevant information:

```ts
/**
 * Parse and validate an email address at an external input boundary.
 *
 * @param input - Raw input received from outside the application.
 * @returns A validated email address, or `InvalidEmailAddress` when validation fails.
 */
export function parseEmailAddress(input: string): Result<EmailAddress, InvalidEmailAddress>;
```

Add `@template` when a type parameter has a role or constraint the signature does not make clear:

```ts
/**
 * Map the success value of a result while preserving its error channel.
 *
 * @template E - Error channel preserved without invoking `fn`.
 * @param fn - Transforms the success value; it is skipped when `result` contains an error.
 * @returns A result containing the transformed success value or the original error.
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E>;
```

Reserve `@throws` for unrecoverable defects, framework-required behavior, and temporary `notYetImplemented` paths. Describe expected typed errors in `@returns` or the operation's documented outcomes.

Document exported object fields whose semantics extend beyond their names and types:

```ts
/** Options that bound and identify an outbound request. */
export type RequestOptions = {
  /** Total request budget, including connection setup and retries. */
  readonly timeout: Duration;

  /** Correlation identifier forwarded unchanged to downstream services. */
  readonly correlationId: CorrelationId;
};
```
