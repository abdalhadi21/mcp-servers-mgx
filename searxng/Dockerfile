FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install

# Copy source files
COPY tsconfig.json ./
COPY src/ ./src/

# Build the project
RUN pnpm run build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --production

COPY --from=builder /app/build ./build

RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3000

ENV NODE_ENV=production
ENV MCP_TRANSPORT=sse
ENV PORT=3000

ENTRYPOINT ["node", "build/index.js"]