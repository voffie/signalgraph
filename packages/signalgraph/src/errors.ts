import { Schema } from "effect";

export class ConfigNotFoundError extends Schema.TaggedError<ConfigNotFoundError>()("ConfigNotFoundError", {
  cwd: Schema.String,
  searched: Schema.String,
}) { }

export class InvalidConfigError extends Schema.TaggedError<InvalidConfigError>()("InvalidConfigError", {
  cause: Schema.Unknown
}) { }

export class InvalidConfigExportError extends Schema.TaggedError<InvalidConfigExportError>()("InvalidConfigExportError", {
  path: Schema.String,
  reason: Schema.String,
}) { }

export class InvalidSchemaError extends Schema.TaggedError<InvalidSchemaError>()("InvalidSchemaError", {
  path: Schema.String,
  reason: Schema.String,
}) { }

export class ModuleImportError extends Schema.TaggedError<ModuleImportError>()("ModuleImportError", {
  path: Schema.String,
  cause: Schema.Unknown,
}) { }
