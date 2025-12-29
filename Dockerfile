FROM node:22-slim AS build

# Install libsecret during build so the CLI doesn't crash if it runs
RUN apt-get update && apt-get install -y \
    libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npm run build

# Final Stage
FROM node:22-slim

# Install libsecret for runtime
RUN apt-get update && apt-get install -y \
    libsecret-1-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules

ENTRYPOINT ["node", "dist/index.js"]
