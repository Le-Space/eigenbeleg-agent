# SPDX-License-Identifier: AGPL-3.0-or-later
# The Eigenbeleg API (and the web UI it serves), for a container with a
# read-only root filesystem. Only the API's production dependencies: no
# agent, no Playwright, no video tools.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# The workspace manifests first, so the dependency layer is cached.
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm ci --omit=dev --workspace=apps/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf apps/agent/test apps/api/test packages/*/test

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
CMD ["node", "apps/api/src/server.js"]
