import type { ReportPayload } from "@/report/build-payload";

/**
 * The report prompt (US-D1).
 *
 * **Bump `PROMPT_VERSION` on every change.** It is stored with each report
 * (FR-4) so a report can be traced back to the exact instructions that produced
 * it. Editing the text without bumping makes older reports unreproducible.
 *
 * The defining constraint: this prompt gives the model **facts and asks for
 * prose**. It never asks the model to judge, rank, or evaluate a position —
 * the engine already did that. Every number here came from Stockfish or the
 * classifier.
 */

export const PROMPT_VERSION = "report-v1";

/** Rating bands from US-D1 — tone adapts, facts do not. */
export function toneForRating(rating: number | null): string {
  if (rating === null) return "intermediate";
  if (rating < 1200) return "beginner";
  if (rating <= 1800) return "intermediate";
  return "advanced";
}

const TONE_GUIDANCE: Record<string, string> = {
  beginner:
    "Write for someone rated under 1200. Avoid opening theory jargon, variation names, and engine-speak. Explain ideas in terms of pieces, squares, and safety. Never use centipawn numbers.",
  intermediate:
    "Write for a 1200-1800 player. You may name common tactical motifs (fork, pin, skewer, back rank) and refer to plans, but keep theory light.",
  advanced:
    "Write for an 1800+ player. You may reference plans, structures, and typical motifs concisely. Assume the notation is read fluently.",
};

export function buildSystemPrompt(tone: string): string {
  return [
    "You are a chess coach writing a short post-game review.",
    "",
    "ABSOLUTE RULES:",
    "1. Every fact you state comes from the DATA provided. You do not analyse the position yourself.",
    "2. Only mention moves that appear in the data — either moves that were played, or engine suggestions listed as alternatives. Never invent, guess, or infer a move.",
    "3. Never mention a square that does not appear in the data.",
    "4. Do not output evaluations, centipawn numbers, or win percentages. Describe consequences in words.",
    "5. If the data does not support a point, leave it out. A shorter accurate review beats a longer speculative one.",
    "",
    TONE_GUIDANCE[tone] ?? TONE_GUIDANCE.intermediate,
    "",
    "FORMAT: 3-5 short paragraphs, 250 words maximum. Address the player as 'you'. No headings, no bullet lists, no move-number prefixes.",
  ].join("\n");
}

/**
 * Serialize the payload as labelled facts.
 *
 * Deliberately flat and boring: the model's job is to turn these into sentences,
 * and structure it cannot misread is worth more than structure that reads
 * nicely.
 */
export function buildUserPrompt(payload: ReportPayload): string {
  const lines: string[] = [];

  lines.push("GAME");
  lines.push(`You played as: ${payload.subjectColor}`);
  lines.push(`Result: ${payload.result}`);
  lines.push(`Time control: ${payload.timeControl}`);
  if (payload.opening) lines.push(`Opening: ${payload.opening}`);
  lines.push(`Your rating: ${payload.subjectRating ?? "unknown"}`);
  lines.push(`Opponent rating: ${payload.opponentRating ?? "unknown"}`);
  lines.push(`Your accuracy: ${payload.accuracy}`);
  lines.push("");

  lines.push("YOUR MOVE QUALITY (counts)");
  for (const [category, count] of Object.entries(payload.counts)) {
    if (count > 0) lines.push(`${category}: ${count}`);
  }
  lines.push("");

  lines.push("KEY MOMENTS (the moves that cost you the most)");
  if (payload.keyMoments.length === 0) {
    lines.push("None - you did not make a significant mistake.");
  }
  for (const moment of payload.keyMoments) {
    lines.push(
      [
        `- Move ${moment.moveNumber} (${moment.color}): you played ${moment.san}`,
        `  Verdict: ${moment.label} - ${moment.description}`,
        moment.bestSan ? `  Engine preferred: ${moment.bestSan}` : "  Engine preferred: unknown",
        moment.phase ? `  Phase: ${moment.phase}` : "",
        moment.lowClock ? "  You were low on time here." : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (payload.timeTrouble) {
    lines.push("");
    lines.push("TIME: A meaningful share of your mistakes happened while low on the clock.");
  }

  lines.push("");
  lines.push(
    "Write the review now. Use only the moves and squares named above. Do not mention any other move.",
  );

  return lines.join("\n");
}
