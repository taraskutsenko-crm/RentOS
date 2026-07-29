# syntax=docker/dockerfile:1
#
# Build context is the repository root (see docker/docker-compose.yml),
# since this is a pnpm workspace and the API depends on workspace packages.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/config/package.json ./packages/config/package.json
COPY packages/shared/package.json ./packages/shared/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/localization/package.json ./packages/localization/package.json
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --frozen-lockfile

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
