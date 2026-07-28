/**
 * Activation-funnel telemetry (FR-6).
 *
 * Privacy-respecting by construction, not by policy:
 *   - No third-party ad trackers (FR-6).
 *   - Events carry no email, no username, no IP. The funnel needs *counts*,
 *     not identities, and an identifier we never collect cannot leak.
 *   - Consent-based (NFR-PR2): the caller decides whether to emit.
 *
 * The sink is pluggable because the analytics vendor is still open (plan §2
 * names Plausible/PostHog EU as candidates). Emitting to the log by default
 * means the funnel is observable from day one rather than after a vendor
 * decision.
 */

/** The activation funnel from PRD §2, in order. */
export type FunnelEvent =
  | "username_submitted"
  | "import_succeeded"
  | "import_failed"
  | "analysis_started"
  | "analysis_completed"
  | "report_viewed"
  | "summary_generated"
  | "summary_degraded"
  | "email_captured"
  | "rate_limited";

export type EventProperties = Readonly<Record<string, string | number | boolean>>;

export interface TelemetrySink {
  record(event: FunnelEvent, properties?: EventProperties): void;
}

/**
 * Keys we refuse to emit, whatever a caller passes.
 *
 * A blocklist is normally the weaker choice, but here it is a backstop *behind*
 * the rule that events carry no identities — it catches the case where someone
 * later adds a property without thinking, which is exactly when this leaks.
 */
const FORBIDDEN_KEYS = new Set([
  "email",
  "username",
  "ip",
  "address",
  "name",
  "user",
  "player",
  "token",
]);

export function scrub(properties: EventProperties | undefined): EventProperties {
  if (!properties) return {};
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue;
    clean[key] = value;
  }
  return clean;
}

/** Default sink: structured logs. Replaced when a vendor is chosen. */
export class LogTelemetrySink implements TelemetrySink {
  record(event: FunnelEvent, properties?: EventProperties): void {
    const clean = scrub(properties);
    console.info(`[funnel] ${event} ${JSON.stringify(clean)}`);
  }
}

export class MemoryTelemetrySink implements TelemetrySink {
  readonly events: Array<{ event: FunnelEvent; properties: EventProperties }> = [];
  record(event: FunnelEvent, properties?: EventProperties): void {
    this.events.push({ event, properties: scrub(properties) });
  }
}

let sink: TelemetrySink = new LogTelemetrySink();

export function setTelemetrySink(next: TelemetrySink): void {
  sink = next;
}

export function track(event: FunnelEvent, properties?: EventProperties): void {
  try {
    sink.record(event, properties);
  } catch {
    // Telemetry must never break a request. A dropped metric is an
    // inconvenience; a 500 because analytics failed is a bug.
  }
}
