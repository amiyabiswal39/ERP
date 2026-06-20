# Build & run the API from the monorepo root context
FROM node:20-alpine
WORKDIR /app

# Install deps (root + workspaces)
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install

# Copy source
COPY packages/shared packages/shared
COPY apps/api apps/api

# Build shared + generate prisma client + compile api
RUN npm run build -w @erp/shared \
  && npx prisma generate --schema apps/api/prisma/schema.prisma \
  && npm run build -w @erp/api

EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
