# syntax=docker/dockerfile:1
#
# Build context is the repository root (see docker/docker-compose.yml),
# since this is a pnpm workspace and the API depends on workspace packages.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
# Puppeteer's own postinstall download is a glibc build that cannot run on
# Alpine's musl libc anyway (see ADR 0011) — skip it everywhere in this
# image and rely on the apk-installed system Chromium in the runner stage
# instead. Local dev/CI (non-Alpine) are unaffected by this Dockerfile.
ENV PUPPETEER_SKIP_DOWNLOAD=true

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/localization/package.json ./packages/localization/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile --trust-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @rentos/shared build
RUN pnpm --filter @rentos/localization build
RUN pnpm --filter @rentos/api exec prisma generate
RUN pnpm --filter @rentos/api build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

# System Chromium for DocumentPdfService's Puppeteer-based rendering (see
# rendering/pdf-renderer.service.ts and ADR 0011) — Puppeteer's own bundled
# download was skipped above because it's a glibc build incompatible with
# Alpine's musl libc, so this apk package is the only Chromium the runner
# image ships. Puppeteer reads PUPPETEER_EXECUTABLE_PATH itself whenever
# `executablePath` is omitted from `puppeteer.launch()`.
RUN apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma

# Local-development/production-fallback file storage adapter root (asset
# images/documents) — see docs/adr/0005-asset-file-storage-strategy.md.
RUN mkdir -p /app/storage-uploads && chown -R nestjs:nodejs /app/storage-uploads

USER nestjs
EXPOSE 4000
CMD ["node", "apps/api/dist/main.js"]
