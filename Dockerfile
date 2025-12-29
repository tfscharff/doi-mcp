FROM node:22-slim AS build

# Install build tools and libsecret
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

# Final Stage
FROM node:22-slim
RUN apt-get update && apt-get install -y libsecret-1-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

ENTRYPOINT ["node", "dist/index.js"]
