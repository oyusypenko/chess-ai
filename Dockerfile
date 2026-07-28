# syntax=docker/dockerfile:1.7
#
# ChessCoach AI — container image.
#
# ⚠️ SCOPE: this is for **local development, CI, and self-hosting** — it is not
# the production deploy path. Production runs on Cloudflare Workers via OpenNext
# (D-05), which deploys a Worker bundle rather than a container. Keeping both
# means: `npm run deploy` ships production; Docker gives everyone an identical
# Node + Chromium + engine-asset environment without installing them locally,
# and gives us a way to self-host if we ever leave Cloudflare.
#
# Node 22 to match the CI matrix in .github/workflows/ci.yml.

# ---------------------------------------------------------------- base
FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
WORKDIR /app

# ---------------------------------------------------------------- deps
# Separate layer so a source edit does not re-run npm ci.
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

# ---------------------------------------------------------------- engine assets
# The GPLv3 Stockfish build + its 14.4 MB NNUE network (NFR-L3). Cached in its
# own layer because the network is content-hash-named and effectively immutable
# — re-downloading it on every source change would make builds miserable.
FROM deps AS engine
COPY scripts/fetch-engine-assets.mjs ./scripts/
RUN node scripts/fetch-engine-assets.mjs

# ---------------------------------------------------------------- builder
FROM deps AS builder
COPY --from=engine /app/public/engine ./public/engine
COPY . .
# prebuild would re-fetch the engine; it is already staged above.
RUN npm run build -- --no-lint 2>/dev/null || npx next build

# ---------------------------------------------------------------- runner
FROM base AS runner
ENV NODE_ENV=production
# Never run as root — the container serves untrusted input (usernames, PGNs).
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=deps    /app/package.json /app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

COPY --from=builder --chown=nextjs:nodejs /app/.next        ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public       ./public
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./
COPY --from=builder --chown=nextjs:nodejs /app/open-next.config.ts ./

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

# COOP/COEP (FR-7) come from next.config.ts, so they hold here exactly as they
# do in production. The smoke test can be pointed at this container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "next", "start"]

# ---------------------------------------------------------------- dev
FROM deps AS dev
ENV NODE_ENV=development
COPY --from=engine /app/public/engine ./public/engine
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]

# ---------------------------------------------------------------- e2e
# Playwright's own image, because Chromium's system libraries are a moving
# target that is not worth reproducing by hand.
FROM mcr.microsoft.com/playwright:v1.56.0-noble AS e2e
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 CI=1
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY --from=engine /app/public/engine ./public/engine
COPY . .
RUN npx next build
CMD ["npx", "playwright", "test", "--project=mobile-360"]
