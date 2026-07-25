import { Schema } from "effect";

export class ConfigNotFoundError extends Schema.TaggedErrorClass<ConfigNotFoundError>()("ConfigNotFoundError", {
  cwd: Schema.String,
  searched: Schema.String,
}) { }

export class InvalidConfigError extends Schema.TaggedErrorClass<InvalidConfigError>()("InvalidConfigError", {
  cause: Schema.Unknown
}) { }

export class InvalidConfigExportError extends Schema.TaggedErrorClass<InvalidConfigExportError>()("InvalidConfigExportError", {
  path: Schema.String,
  reason: Schema.String,
}) { }

export class InvalidSchemaError extends Schema.TaggedErrorClass<InvalidSchemaError>()("InvalidSchemaError", {
  path: Schema.String,
  reason: Schema.String,
}) { }

export class ModuleImportError extends Schema.TaggedErrorClass<ModuleImportError>()("ModuleImportError", {
  path: Schema.String,
  cause: Schema.Unknown,
}) { }
