# Stage 1: Build
FROM node:22-slim AS build

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libsecret-1-0 \
    python3 \
    make \
    g++ \
    pkg-config \
    libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Stage 2: Production
FROM node:22-slim

# Install runtime dependency
RUN apt-get update && apt-get install -y \
    libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built files and node_modules from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

# Run the server directly (Bypassing Smithery CLI)
ENTRYPOINT ["node", "dist/index.js"]
