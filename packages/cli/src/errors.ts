/** Exit codes scripts can tell apart. */
export const exitCodes = {
  ok: 0,
  /** LobbyStack or the network failed, the work failed, or the key hit a rate limit: trying again later may work. */
  failed: 1,
  /** The command or its input is wrong. */
  invalid: 2,
  /** The API key is missing or invalid, or isn't allowed to do this. */
  auth: 3,
  /** It did all it could, and the rest waits on someone else, such as a payment: run it again once they're done. */
  waiting: 4,
} as const;

export type ExitCode = (typeof exitCodes)[keyof typeof exitCodes];

/** A failure to report as a message and an exit code, without a stack trace. */
export class CliError extends Error {
  /** The Idempotency-Key a retry should send, when the command made one up. */
  idempotencyKey?: string;

  constructor(message: string, readonly exitCode: ExitCode = exitCodes.invalid) {
    super(message);
    this.name = "CliError";
  }
}

/** An error the API answered with. */
export class ApiError extends CliError {
  constructor(readonly status: number, readonly code: string, message: string, readonly details: ReadonlyArray<{ path: string; message: string }> = []) {
    super(message, status === 401 || status === 403 ? exitCodes.auth : status === 429 || status >= 500 ? exitCodes.failed : exitCodes.invalid);
    this.name = "ApiError";
  }
}
