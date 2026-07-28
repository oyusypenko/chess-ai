/**
 * Provider abstraction (FR-4).
 *
 * Provider SDKs are imported **nowhere else** in the codebase — the write-time
 * hook enforces it. Swapping models or vendors must be a change in this
 * directory, not a migration across the app.
 *
 * `promptVersion` and `model` travel with every result because FR-4 requires a
 * report be reproducible: one you cannot regenerate is one you cannot debug.
 */

export type LlmMessage = { readonly role: "user" | "assistant"; readonly content: string };

export type LlmRequest = {
  readonly system: string;
  readonly messages: readonly LlmMessage[];
  readonly maxTokens: number;
};

export type LlmUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** USD, computed from the provider's published rates. */
  readonly costUsd: number;
};

export type LlmResponse = {
  readonly text: string;
  readonly model: string;
  readonly usage: LlmUsage;
};

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * Raised when the provider is unreachable or errors.
 *
 * Distinct from any other failure because it has a designed product response:
 * render the engine-only report with "AI summary pending" (NFR-R1). It is not
 * an error the user should ever see as an error.
 */
export class LlmUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LlmUnavailableError";
  }
}

/** US-D1 budget. Enforced at the call site, not merely hoped for. */
export const COST_BUDGET_USD = 0.02;
