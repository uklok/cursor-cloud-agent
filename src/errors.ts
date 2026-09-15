export class CursorCloudError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export class ConfigError extends CursorCloudError {
  constructor(message: string, options?: ErrorOptions) {
    super("config", message, options);
  }
}

export class PolicyError extends CursorCloudError {
  constructor(message: string, options?: ErrorOptions) {
    super("policy", message, options);
  }
}

export class TimeoutError extends CursorCloudError {
  constructor(message: string, options?: ErrorOptions) {
    super("timeout", message, options);
  }
}

export class CursorCloudApiError extends CursorCloudError {
  readonly httpStatus: number;
  readonly apiCode?: string;
  readonly details?: unknown;

  constructor(
    httpStatus: number,
    message: string,
    options?: { apiCode?: string; details?: unknown; cause?: unknown },
  ) {
    super("api", message, options?.cause ? { cause: options.cause } : undefined);
    this.httpStatus = httpStatus;
    this.apiCode = options?.apiCode;
    this.details = options?.details;
  }
}

export function formatError(error: unknown): { ok: false; error: string; code: string } {
  if (error instanceof CursorCloudError) {
    return { ok: false, error: error.message, code: error.code };
  }
  if (error instanceof Error) {
    return { ok: false, error: error.message, code: "internal" };
  }
  return { ok: false, error: String(error), code: "internal" };
}
