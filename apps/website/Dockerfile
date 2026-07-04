# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22

# --- build stage ---
# Build context = monorepo root. Install all workspace deps so the
# build resolves @bookkeeprr/* workspace packages.
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/website/package.json apps/website/
COPY packages/tokens/package.json packages/tokens/
COPY packages/types/package.json packages/types/
COPY packages/logic/package.json packages/logic/
COPY packages/ui/package.json packages/ui/
# The root package.json declares pnpm.patchedDependencies for
# react-native-track-player; pnpm reads the patch file at install time
# even on workspaces that don't depend on it. Copy patches/ before the
# install or pnpm errors with ENOENT and the build aborts.
COPY patches/ patches/
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @bookkeeprr/website...

COPY apps/website apps/website
COPY packages packages

RUN pnpm --filter @bookkeeprr/website build

# --- runtime stage ---
# Node server running Next's standalone output. The site is server-rendered so
# it resolves the release version at request time (ISR-cached hourly) without a
# rebuild; that needs a running process, not a static file server.
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Keep port 8080 so the existing ingress/Service is unchanged.
ENV PORT=8080
ENV HOSTNAME=0.0.0.0

# The deploy health gate probes with wget from inside the container;
# bookworm-slim doesn't ship it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends wget \
 && rm -rf /var/lib/apt/lists/*

# Standalone server bundle (mirrors the monorepo layout under /app because
# outputFileTracingRoot is the repo root). Static assets and public/ are not
# part of the trace, so copy them into the paths the server expects.
COPY --from=build /app/apps/website/.next/standalone ./
COPY --from=build /app/apps/website/.next/static ./apps/website/.next/static
COPY --from=build /app/apps/website/public ./apps/website/public

EXPOSE 8080
CMD ["node", "apps/website/server.js"]
