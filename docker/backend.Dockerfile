# Backend image (dev-friendly with optional prod build)
FROM node:20-alpine

WORKDIR /app/backend

# Allow choosing dev (ts-node-dev) or prod (build + node) at build time
# usage:
#   docker build -f docker/backend.Dockerfile --build-arg RUN_MODE=dev -t backend:dev .
#   docker build -f docker/backend.Dockerfile --build-arg RUN_MODE=prod -t backend:prod .
ARG RUN_MODE=prod
ENV RUN_MODE=${RUN_MODE}

# Install dependencies early for better caching
COPY backend/package*.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest of the backend source
COPY backend/ ./

# In prod mode, build TypeScript → dist; in dev mode, keep sources
RUN if [ "$RUN_MODE" = "prod" ]; then npm run build; fi

# Defaults (can be overridden by Compose/env)
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# Entry: dev uses ts-node-dev for hot reload; prod runs compiled JS
# Note: Compose can still override this CMD with its own command.
CMD ["sh","-lc","if [ \"$RUN_MODE\" = \"dev\" ]; then npx ts-node-dev --respawn --transpile-only src/index.ts; else node dist/index.js; fi"]
