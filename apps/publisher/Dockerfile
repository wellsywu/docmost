# Build context is the repository root: docker build -f apps/publisher/Dockerfile .
FROM node:22-slim AS base

RUN npm install -g pnpm@10.4.0

FROM base AS builder

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @docmost/integration-db build
RUN pnpm --filter publisher build

FROM base AS runtime

# @resvg/resvg-js renders with system fonts; CJK diagrams need these.
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/apps/publisher/dist /app/apps/publisher/dist
COPY --from=builder /app/apps/publisher/package.json /app/apps/publisher/package.json
COPY --from=builder /app/packages/integration-db/dist /app/packages/integration-db/dist
COPY --from=builder /app/packages/integration-db/package.json /app/packages/integration-db/package.json
COPY --from=builder /app/package.json /app/package.json
# pnpm links workspace modules into /app/node_modules/.pnpm, so both trees are
# copied at their original paths instead of reinstalling without a workspace.
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/publisher/node_modules /app/apps/publisher/node_modules

ENV NODE_ENV=production
ENV PUBLISHER_HOST=0.0.0.0
EXPOSE 3050

CMD ["node", "apps/publisher/dist/main.js"]
