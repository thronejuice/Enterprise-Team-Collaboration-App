# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY tests/e2e/package.json tests/e2e/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --filter @demo/api
COPY apps/api apps/api
RUN pnpm --filter @demo/api build \
  && pnpm --filter @demo/api deploy --prod --legacy /out \
  && cp -r apps/api/dist apps/api/prisma /out/ \
  && cd /out && npx prisma generate

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed.js && exec node dist/main.js"]
