import type { NormalizedGame } from "@/model/game";
import type { ReportPayload } from "@/report/build-payload";
import { buildGroundingFacts, validateGrounding, type GroundingIssue } from "./grounding";
import {
  buildSystemPrompt,
  buildUserPrompt,
  toneForRating,
  PROMPT_VERSION,
} from "./prompt/report-prompt";
import { LlmUnavailableError, type LlmProvider, type LlmUsage, COST_BUDGET_USD } from "./provider";

/**
 * Generate the coaching summary (US-D1, FR-4, NFR-R1).
 *
 * Implements the contract exactly: generate → validate → **regenerate once** →
 * validate → strip the offending sentences. There is no third attempt and no
 * path that renders unvalidated text.
 */

export const MAX_WORDS = 250;

export type SummaryStatus =
  /** Clean on the first try. */
  | "ok"
  /** Second attempt was clean — the first was not. */
  | "regenerated"
  /** Ungrounded sentences were removed from the final text. */
  | "stripped"
  /** Provider unavailable; caller renders the engine-only report (NFR-R1). */
  | "unavailable";

export type SummaryResult = {
  readonly status: SummaryStatus;
  /** Always safe to render. Empty only when `unavailable`, or if everything was stripped. */
  readonly text: string;
  readonly promptVersion: string;
  readonly model: string | null;
  readonly usage: LlmUsage | null;
  /** For logging and evals — never shown to the user. */
  readonly issues: readonly GroundingIssue[];
  readonly attempts: number;
};

export type GenerateOptions = {
  readonly provider: LlmProvider;
  readonly game: NormalizedGame;
  readonly payload: ReportPayload;
  readonly engineLines?: ReadonlyMap<number, readonly string[]>;
  /** Called with the cost of each attempt, for telemetry. */
  readonly onUsage?: (usage: LlmUsage) => void;
};

export async function generateSummary(options: GenerateOptions): Promise<SummaryResult> {
  const { provider, game, payload, engineLines, onUsage } = options;

  const facts = buildGroundingFacts(game, engineLines);
  const system = buildSystemPrompt(toneForRating(payload.subjectRating));
  const user = buildUserPrompt(payload);

  const request = {
    system,
    messages: [{ role: "user" as const, content: user }],
    // 250 words ≈ 400 tokens; the headroom covers the model overshooting
    // slightly, and `enforceWordLimit` trims rather than trusting it.
    maxTokens: 700,
  };

  let attempts = 0;
  let firstIssues: readonly GroundingIssue[] = [];
  let totalUsage: LlmUsage | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;

    let response;
    try {
      response = await provider.complete(
        attempt === 1
          ? request
          : {
              ...request,
              // The retry is not a plain repeat: tell the model exactly what it
              // got wrong. A blind retry usually reproduces the same
              // hallucination.
              messages: [
                { role: "user" as const, content: user },
                {
                  role: "user" as const,
                  content: retryInstruction(firstIssues),
                },
              ],
            },
      );
    } catch (cause) {
      // NFR-R1: the caller renders the engine-only report. Not an error state
      // the user sees as an error.
      throw new LlmUnavailableError("LLM provider unavailable", { cause });
    }

    onUsage?.(response.usage);
    totalUsage = accumulate(totalUsage, response.usage);

    const trimmed = enforceWordLimit(response.text, MAX_WORDS);
    const validation = validateGrounding(trimmed, facts);

    if (validation.ok) {
      return {
        status: attempt === 1 ? "ok" : "regenerated",
        text: trimmed,
        promptVersion: PROMPT_VERSION,
        model: response.model,
        usage: totalUsage,
        issues: attempt === 1 ? [] : firstIssues,
        attempts,
      };
    }

    if (attempt === 1) {
      firstIssues = validation.issues;
      continue;
    }

    // Second attempt still ungrounded → strip. This is the floor: whatever
    // survives is verified, and a hallucinated move never renders.
    return {
      status: "stripped",
      text: validation.cleanedText,
      promptVersion: PROMPT_VERSION,
      model: response.model,
      usage: totalUsage,
      issues: [...firstIssues, ...validation.issues],
      attempts,
    };
  }

  // Unreachable; the loop always returns.
  throw new LlmUnavailableError("Summary generation did not complete");
}

function retryInstruction(issues: readonly GroundingIssue[]): string {
  const tokens = [...new Set(issues.map((i) => i.token))];
  return [
    "Your previous answer referenced moves or squares that do not appear in the data:",
    tokens.map((t) => `- ${t}`).join("\n"),
    "",
    "Those do not exist in this game. Rewrite the review using ONLY the moves and squares listed in the data above.",
  ].join("\n");
}

/**
 * Enforce the word limit by truncating at a sentence boundary.
 *
 * Cutting mid-sentence would produce text that reads as broken; dropping whole
 * sentences keeps the output coherent even when the model overshoots.
 */
export function enforceWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();

  const truncated = words.slice(0, maxWords).join(" ");
  const lastStop = Math.max(
    truncated.lastIndexOf("."),
    truncated.lastIndexOf("!"),
    truncated.lastIndexOf("?"),
  );
  return lastStop > 0 ? truncated.slice(0, lastStop + 1) : `${truncated}…`;
}

function accumulate(total: LlmUsage | null, next: LlmUsage): LlmUsage {
  if (!total) return next;
  return {
    inputTokens: total.inputTokens + next.inputTokens,
    outputTokens: total.outputTokens + next.outputTokens,
    costUsd: total.costUsd + next.costUsd,
  };
}

/** US-D1 budget check — surfaced so a bad prompt change shows up as cost. */
export function isOverBudget(usage: LlmUsage | null): boolean {
  return usage !== null && usage.costUsd > COST_BUDGET_USD;
}
