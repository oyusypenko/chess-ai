/**
 * Typed import failures (NFR-R2).
 *
 * Every one of these maps to a designed user-facing state. A thrown `Error`
 * with a string message does not — it becomes a stack trace on someone's
 * screen, which US-A1 explicitly forbids.
 */

export type ImportErrorKind =
  /** Username does not exist on the platform. */
  | "user_not_found"
  /** User exists but has no finished games we can analyze. */
  | "no_finished_games"
  /** Platform rate-limited us; we already waited and retried once (FR-2). */
  | "rate_limited"
  /** Platform is down or returned 5xx. */
  | "platform_unavailable"
  /** Network failure or timeout reaching the platform. */
  | "network"
  /** Response arrived but could not be parsed into our model. */
  | "malformed_response"
  /** Caller supplied something we refuse to look up (NFR-S2). */
  | "invalid_username";

export class ImportError extends Error {
  readonly kind: ImportErrorKind;
  /** Safe to render verbatim to a user — no internals, no stack. */
  readonly userMessage: string;
  readonly retryable: boolean;

  constructor(
    kind: ImportErrorKind,
    userMessage: string,
    options?: { retryable?: boolean; cause?: unknown },
  ) {
    super(`${kind}: ${userMessage}`, { cause: options?.cause });
    this.name = "ImportError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.retryable = options?.retryable ?? false;
  }
}

/** Copy for each failure. Kept here so wording stays consistent and reviewable. */
export const IMPORT_ERROR_MESSAGES: Record<ImportErrorKind, string> = {
  user_not_found: "We couldn't find that username on Lichess. Check the spelling and try again.",
  no_finished_games:
    "That account doesn't have any finished games yet. Play a game, then come back — we can only review games that are over.",
  rate_limited: "Lichess is rate-limiting us right now. Please try again in a minute.",
  platform_unavailable: "Lichess seems to be having trouble right now. Please try again shortly.",
  network: "We couldn't reach Lichess. Check your connection and try again.",
  malformed_response: "We got an unexpected response from Lichess and couldn't read that game.",
  invalid_username: "That doesn't look like a valid Lichess username.",
};

export function importError(
  kind: ImportErrorKind,
  options?: { retryable?: boolean; cause?: unknown },
): ImportError {
  return new ImportError(kind, IMPORT_ERROR_MESSAGES[kind], options);
}
