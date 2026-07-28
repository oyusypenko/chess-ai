import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext adapter config for Cloudflare Workers.
 *
 * Deliberately minimal for M1. Incremental-cache backing (R2) and any
 * queue/tag-cache overrides land when there is server-rendered content worth
 * caching — the P0 demo renders per-request reports, so caching is not yet a
 * question we can answer honestly.
 *
 * See docs/decisions.md D-05 for why Cloudflare over Vercel.
 */
export default defineCloudflareConfig();
