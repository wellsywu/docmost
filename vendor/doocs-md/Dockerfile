FROM node:22.22.2-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.1.3 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps ./apps
COPY packages ./packages
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
# Plain `build` keeps vite's default base of /md/ (see apps/web/vite.config.ts);
# build:h5-netlify sets SERVER_ENV=NETLIFY, which forces base to / and breaks
# asset resolution when the SPA is served under the /md/ subpath.
RUN pnpm web build

FROM nginx:1.27-alpine

COPY docker/docmost-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
