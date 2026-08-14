# Digital Footprint Intelligence (DFI) — local-first container image.
#
# Base image: Microsoft's Playwright image ships Node.js + a pre-installed,
# dependency-complete Chromium, which the PDF report generator
# (packages/report/src/pdf-report.ts) needs. This avoids a separate
# `playwright install --with-deps` step and its large apt footprint.
FROM mcr.microsoft.com/playwright:v1.48.2-noble AS base

# Node 22.13+ is required for the built-in node:sqlite module. The Playwright
# noble image tracks recent Node LTS/current releases; verify at build time.
RUN node -e "const [maj,min]=process.versions.node.split('.').map(Number); if (maj<22 || (maj===22 && min<13)) { console.error('Node >=22.13 required, found', process.version); process.exit(1); }"

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/report/package.json packages/report/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# Copy the rest of the source and build the web dashboard.
COPY . .
RUN npm run build -w apps/web

ENV NODE_ENV=production
ENV PORT=3000
ENV DFI_DB_PATH=/app/data/dfi.sqlite
# The Playwright base image installs Chromium under /root/.cache/ms-playwright;
# leave PLAYWRIGHT_CHROMIUM_PATH unset so pdf-report.ts falls back to
# Playwright's standard resolution, which finds it automatically there.

VOLUME ["/app/data", "/app/reports/generated"]
EXPOSE 3000

CMD ["npm", "run", "start", "-w", "apps/web"]
