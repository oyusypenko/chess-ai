import { NextResponse } from "next/server";
import type { NormalizedGame, PositionEval } from "@/model/game";
import { classifyGame } from "@/classifier/classify-game";
import { buildReportPayload } from "@/report/build-payload";
import { generateSummary, type SummaryResult } from "@/llm/generate-summary";
import { LlmUnavailableError } from "@/llm/provider";
import { createAnthropicProvider } from "@/llm/providers/anthropic";

/**
 * `POST /api/report` — classified game in, coached summary out (US-D1, FR-4).
 *
 * Server-mediated because the provider key must never reach the client (US-F1,
 * NFR-S1). The client does the engine work; only the structured result crosses
 * back here.
 *
 * **Degradation is the point of the error handling** (NFR-R1): if the provider
 * is unavailable, this returns a successful response with the classifications
 * and no summary, so the UI renders the engine-only report with "AI summary
 * pending". It never 500s on an LLM outage.
 */

export type ReportRequestBody = {
  game: NormalizedGame;
  /** Eval per ply from the client-side engine run. */
  evals: Record<string, PositionEval>;
  /** Engine best lines per ply, UCI. */
  bestLines?: Record<string, string[]>;
};

export type ReportResponse = {
  ok: true;
  classification: ReturnType<typeof classifyGame>;
  summary: {
    text: string;
    status: SummaryResult["status"];
    promptVersion: string;
    model: string | null;
  };
};

export async function POST(request: Request): Promise<NextResponse> {
  let body: ReportRequestBody;
  try {
    body = (await request.json()) as ReportRequestBody;
  } catch {
    return NextResponse.json({ ok: false, message: "Malformed request body." }, { status: 400 });
  }

  const { game, evals, bestLines } = body ?? {};

  // NFR-L1: the type says `finished: true`, but a request body is untrusted
  // input — the compiler cannot enforce it across the wire, so check.
  if (!game?.moves || game.finished !== true) {
    return NextResponse.json(
      { ok: false, message: "Only finished games can be analyzed." },
      { status: 400 },
    );
  }

  const evalMap = new Map<number, PositionEval>(
    Object.entries(evals ?? {}).map(([ply, e]) => [Number(ply), e]),
  );
  const lineMap = new Map<number, readonly string[]>(
    Object.entries(bestLines ?? {}).map(([ply, pv]) => [Number(ply), pv]),
  );

  const classification = classifyGame({ game, evals: evalMap, bestLines: lineMap });
  const payload = buildReportPayload(game, classification);

  // Everything above is deterministic and always succeeds. Only the summary
  // can fail, and it fails soft.
  let summary: ReportResponse["summary"] = {
    text: "",
    status: "unavailable",
    promptVersion: "",
    model: null,
  };

  try {
    const provider = createAnthropicProvider();
    const result = await generateSummary({
      provider,
      game,
      payload,
      engineLines: lineMap,
      onUsage: (usage) => {
        // Cost telemetry: the ≤$0.02 budget is a claim we must be able to
        // check, and a bad prompt change shows up here before it shows up in
        // quality.
        console.info(
          `[report] game=${game.id} model=${provider.model} in=${usage.inputTokens} out=${usage.outputTokens} usd=${usage.costUsd.toFixed(5)}`,
        );
      },
    });
    summary = {
      text: result.text,
      status: result.status,
      promptVersion: result.promptVersion,
      model: result.model,
    };
    if (result.issues.length > 0) {
      console.warn(
        `[report] grounding issues game=${game.id} status=${result.status} tokens=${result.issues.map((i) => i.token).join(",")}`,
      );
    }
  } catch (error) {
    if (error instanceof LlmUnavailableError) {
      console.warn(`[report] LLM unavailable, degrading to engine-only: ${error.message}`);
    } else {
      console.error("[report] unexpected summary failure", error);
    }
    // Fall through with status "unavailable" — the engine-only report still
    // renders (NFR-R1).
  }

  return NextResponse.json({ ok: true, classification, summary } satisfies ReportResponse);
}
