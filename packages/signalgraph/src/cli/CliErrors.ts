import { Schema } from "effect";
import { CliError } from "effect/cli";

/** The CLI could not find a configuration in the current directory or its parents. */
export class ConfigNotFoundError extends Schema.TaggedError<ConfigNotFoundError>()("ConfigNotFoundError", {
  cwd: Schema.String,
  searched: Schema.String
}) {
  /** Tells the caller where to run generation or add its configuration. */
  override get [CliError.userMessage]() {
    return `Cannot find ${this.searched}. Run generation from a configured project or add the config file.`;
  }
}

/** The loaded module did not expose a usable default configuration. */
export class InvalidConfigExportError extends Schema.TaggedError<InvalidConfigExportError>()(
  "InvalidConfigExportError",
  {
    path: Schema.String,
    reason: Schema.String
  }
) {
  /** Renders only the actionable configuration error. */
  override get [CliError.userMessage]() {
    return `Cannot load the SignalGraph config. ${this.reason}`;
  }
}

/** A schema module contains declarations that cannot form one generated client. */
export class InvalidSchemaError extends Schema.TaggedError<InvalidSchemaError>()("InvalidSchemaError", {
  path: Schema.String,
  reason: Schema.String
}) {
  /** Renders the invalid declaration and how to correct it. */
  override get [CliError.userMessage]() {
    return `Cannot load the SignalGraph schema. ${this.reason}`;
  }
}

/** A project file could not be evaluated as a module. */
export class ModuleImportError extends Schema.TaggedError<ModuleImportError>()("ModuleImportError", {
  path: Schema.String,
  cause: Schema.Unknown
}) {
  /** Renders the failing project file without exposing the underlying exception. */
  override get [CliError.userMessage]() {
    return `Cannot import ${this.path}. Check that the file and its imports can be loaded by Node.js.`;
  }
}

/** The config is outside a valid ESM project. */
export class NotEsmProjectError extends Schema.TaggedError<NotEsmProjectError>()("NotEsmProjectError", {
  configPath: Schema.String,
  reason: Schema.String
}) {
  /** Renders the configuration change needed to use ESM. */
  override get [CliError.userMessage]() {
    return `Cannot load the SignalGraph config outside an ESM project. ${this.reason}`;
  }
}
