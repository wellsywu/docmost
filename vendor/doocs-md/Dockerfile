FROM node:22.22.2-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm web build:h5-netlify

FROM nginx:1.27-alpine

COPY docker/docmost-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
