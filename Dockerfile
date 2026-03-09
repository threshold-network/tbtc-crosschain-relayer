FROM node:20-alpine3.21 AS app 

# Add this for cache busting
ARG CACHE_BUSTER
RUN echo "Deps stage cache buster: ${CACHE_BUSTER}"

WORKDIR /usr/app

# Constrain Node's memory usage during build to avoid OOMs in CI builders
ENV NODE_OPTIONS=--max-old-space-size=1024
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=1

# Minimal tools for fetching git-based dependencies and healthcheck
RUN apk add --no-cache git curl postgresql16-client && \
    git config --global url."https://".insteadOf git:// && \
    git config --global url."https://github.com/".insteadOf "ssh://git@github.com/" && \
    git config --global url."https://github.com/".insteadOf "git@github.com:"

COPY package.json yarn.lock ./

# Install production dependencies only (no scripts)
RUN yarn install --frozen-lockfile --production=true --network-concurrency 1 --prefer-offline --ignore-scripts --ignore-optional


COPY prisma/ ./prisma/
COPY tsconfig.json ./
COPY tsconfig.build.json ./
COPY index.ts ./
COPY instrumentation.ts ./
# Assuming your source code is in these folders or similar top-level folders/files
COPY helpers/ ./helpers/
COPY services/ ./services/
COPY utils/ ./utils/
COPY controllers/ ./controllers/
COPY handlers/ ./handlers/
COPY interfaces/ ./interfaces/
COPY routes/ ./routes/
COPY config/ ./config/
COPY types/ ./types/
COPY target/ ./target/
COPY scripts/ ./scripts/

# Build after sources are copied (avoid full devDependencies)
RUN yarn clean:build \
  && yarn run prisma:generate \
  && npx -y -p typescript@5.5.3 tsc -p tsconfig.build.json

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

ARG APP_PORT=3000
ENV APP_PORT=${APP_PORT}

HEALTHCHECK --interval=5s --timeout=5s --start-period=5s --retries=10 \
  CMD curl -f -v --connect-timeout 3 --max-time 5 http://localhost:${APP_PORT}/status || exit 1

EXPOSE ${APP_PORT}

# Add entrypoint script for running migrations and starting the app
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

CMD ["node", "dist/index.js"]


