# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

ENV NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

WORKDIR /opt/immaculate

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/harness/package.json apps/harness/package.json
COPY apps/tui/package.json apps/tui/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json

RUN npm ci --workspaces --include-workspace-root

COPY packages/core packages/core
COPY apps/harness apps/harness

RUN npm run build -w @immaculate/core \
    && npm run build -w @immaculate/harness \
    && npm prune --omit=dev --workspaces --include-workspace-root

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    IMMACULATE_RUNTIME_DIR=/var/lib/immaculate/runtime \
    IMMACULATE_HARNESS_HOST=0.0.0.0 \
    IMMACULATE_HARNESS_PORT=8787

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 immaculate \
    && useradd \
      --system \
      --uid 10001 \
      --gid 10001 \
      --home-dir /var/lib/immaculate \
      --shell /usr/sbin/nologin \
      immaculate \
    && mkdir -p /var/lib/immaculate/runtime /var/log/immaculate

WORKDIR /opt/immaculate

COPY --from=build /opt/immaculate/package.json ./package.json
COPY --from=build /opt/immaculate/package-lock.json ./package-lock.json
COPY --from=build /opt/immaculate/node_modules ./node_modules
COPY --from=build /opt/immaculate/packages/core/package.json ./packages/core/package.json
COPY --from=build /opt/immaculate/packages/core/dist ./packages/core/dist
COPY --from=build /opt/immaculate/apps/harness/package.json ./apps/harness/package.json
COPY --from=build /opt/immaculate/apps/harness/dist ./apps/harness/dist

RUN chown -R 10001:10001 /opt/immaculate /var/lib/immaculate /var/log/immaculate

USER 10001:10001

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl --fail http://127.0.0.1:8787/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/harness/dist/server.js"]
