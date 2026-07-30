/**
 * CLAUDE.md asks that errors be `AppError` subclasses from `core`, but `geometry` sits
 * upstream of `core` and may not import from it. The base class therefore lives here, at
 * the bottom of the dependency graph, and `core` extends it rather than redefining it.
 */
export class AppError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** A value violated a geometric or unit invariant. */
export class GeometryError extends AppError {}

/** A length literal could not be parsed from text. */
export class LengthParseError extends AppError {
  readonly input: string;

  constructor(input: string, detail: string) {
    super('geometry.length-parse', `Cannot parse "${input}" as a length: ${detail}`);
    this.input = input;
  }
}
