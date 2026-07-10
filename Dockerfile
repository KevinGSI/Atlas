FROM node:24-alpine AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM node:24-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN corepack enable
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json pnpm-lock.yaml ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node db ./db
COPY --chown=node:node web ./web
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ready >/dev/null || exit 1
CMD ["node", "src/server.js"]
