import Anthropic from "@anthropic-ai/sdk";
import {
  LlmUnavailableError,
  type LlmProvider,
  type LlmRequest,
  type LlmResponse,
} from "../provider";

/**
 * Anthropic implementation of the provider interface (FR-4).
 *
 * **The only file in the app allowed to import a provider SDK** — the
 * write-time hook enforces that. Everything else goes through `LlmProvider`.
 *
 * Model choice is O-3, still open. `claude-haiku-4-5` is the P0 default because
 * the plan's cost model puts a full report at roughly $0.01, inside the $0.02
 * budget (US-D1), and this workload is narration of pre-computed facts rather
 * than reasoning — the task the cheapest capable model is best suited to.
 */

/** Published rates, USD per million tokens. Update alongside the model. */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1, output: 5 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-opus-5": { input: 5, output: 25 },
};

export const DEFAULT_MODEL = "claude-haiku-4-5";

export type AnthropicProviderOptions = {
  apiKey?: string;
  /** Premium tier swaps this behind a feature flag (FR-8). */
  model?: string;
  client?: Anthropic;
};

export function createAnthropicProvider(options: AnthropicProviderOptions = {}): LlmProvider {
  const model = options.model ?? DEFAULT_MODEL;
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;

  if (!options.client && !apiKey) {
    throw new LlmUnavailableError("ANTHROPIC_API_KEY is not configured");
  }

  const client = options.client ?? new Anthropic({ apiKey });

  return {
    name: "anthropic",
    model,

    async complete(request: LlmRequest): Promise<LlmResponse> {
      let message;
      try {
        message = await client.messages.create({
          model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        });
      } catch (cause) {
        // Every provider failure becomes the one error the product knows how to
        // degrade from (NFR-R1).
        throw new LlmUnavailableError("Anthropic request failed", { cause });
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("")
        .trim();

      return {
        text,
        model: message.model,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          costUsd: estimateCost(
            message.model,
            message.usage.input_tokens,
            message.usage.output_tokens,
          ),
        },
      };
    },
  };
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  // Unknown model → assume the most expensive tier rather than under-reporting.
  // A cost surprise should show up as a number, not as a silent zero.
  const rates = PRICING[model] ?? PRICING["claude-opus-5"];
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}
