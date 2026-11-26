# Error design

Errors are part of SignalGraph's public interface and its observability model. They must help a human or Agent understand what happened, decide what to do next, and correlate a public failure with internal traces without exposing private implementation details.

This guide draws on Wix UX's [When life gives you lemons, write better error messages](https://wix-ux.com/when-life-gives-you-lemons-write-better-error-messages-46c5223e1a2f).

## Error message principles

### Explain what happened and why

Name the operation or outcome that failed and give the most specific safe reason known. Do not use generic messages such as `Something went wrong` when the application has a classified cause.

Good:

```text
Account account_… was not found. Check the Account ID and try again.
```

Bad:

```text
Something went wrong.
```

### Tell the caller what to do next

When the caller can correct the failure, state the corrective action. When retrying may succeed, say so and identify whether the same logical operation is safe to retry. When the caller cannot resolve the failure, direct them to support with a request identifier.

Do not suggest retrying when an operation may have partially completed or when retrying would create a second logical operation. `retryable` and retry guidance must reflect the operation's actual idempotency and failure protocol.

### Provide only truthful reassurance

State what was not affected when the application can prove it. For example, say that an Account name was unchanged only when the failed operation could not have committed that change.

Use "no changes were made" only when every service can confirm its part of the operation left the resource unchanged. If the outcome is uncertain, tell the caller to read or reconcile the resource.

### Use a calm, direct tone

Treat failures seriously. Avoid jokes, cutesy language, excessive apologies, and alarmist wording. Use concise ordinary language appropriate to the audience and stakes.

### Avoid blame and implementation jargon

Describe the problem rather than blaming the caller or a third party. Public messages use SignalGraph and domain vocabulary, not SQL tables, stack traces, vendor exceptions, or internal service names.

Internal errors may name the failing internal capability when that context helps an operator diagnose the failure, but they still use precise language rather than blame.

### Always provide a way forward

A useful error ends with one of these outcomes:

- correct identified input and retry;
- retry the same logical operation when it is safe;
- inspect or reconcile the named resource when the outcome is uncertain; or
- contact support with the response request identifier.

## Contextual error data

Typed errors carry structured context in addition to a message. Include the fields needed to identify the failed operation and diagnose or recover from it:

- a stable, machine-readable error code or tagged-error discriminant;
- the operation that failed;
- safe domain identifiers such as `accountId` when known;
- a classified reason;
- field violations and accepted constraints for caller-correctable input;
- retryability or recovery guidance; and
- a request identifier at public boundaries.

Use a discriminated union for public errors. Each literal error code has its own details schema, so the code determines which fields can appear.

## Internal and public errors

Internal and public errors serve different audiences but follow the same principles.

Internal typed errors retain enough safe structured data for traces and logs to identify the operation, domain entity, capability, and classified reason. Preserve an underlying cause where it adds diagnostic value and can be retained safely. Error messages begin with a specific, searchable description so an observed message leads back to its source.

Public adapters map internal errors to the HTTP response schema. Public errors contain:

- a stable `code`;
- an operation-specific `message`;
- variant-specific safe `details`;
- a correlation `requestId`; and
- a truthful `retryable` value.

Never expose credentials, access assertions, JWT claims, raw request bodies, SQL, stack traces, private causes, or vendor response bodies. Redaction must not erase useful safe context such as the operation and requested domain ID.

Translate each known tagged error explicitly with `Effect.catchTag` or `Effect.catchTags`. Do not use a catch-all that silently turns a newly introduced failure into a generic response. A new failure type should require an explicit decision about its public classification, message, status, structured context, observability, and recovery guidance.

## HTTP status guidance

Choose the status that describes what happened to the caller's request.

- Use `400` when the caller can correct malformed or invalid request data.
- Use `401` when authentication fails.
- Use `404` when the resource identifier is valid and the resource is unknown.
- Use `405` when the route does not support the request method.
- Use `409` when the current resource state conflicts with the requested operation.
- Use `415` when the request uses an unsupported media type.
- Use `500` when an internal invariant fails or an internal failure persists.
- Use `503` when a required capability is temporarily unavailable.

## Review checklist

Before adding or changing an error, verify:

1. Does it say what operation or outcome failed?
2. Does it give the most specific safe reason known?
3. Does it include useful typed context rather than forcing operators to parse prose?
4. Does it tell the caller how to correct, retry, reconcile, or escalate the failure?
5. Are reassurance and retry guidance provably true?
6. Is the tone calm, direct, and free of blame and implementation jargon?
7. Can the message or code be searched directly in the source?
8. Can a public `requestId` correlate with structured traces and logs?
9. Are secrets, private causes, and raw external data excluded from public output?
10. Does every boundary translate the failure deliberately rather than through a generic catch-all?
