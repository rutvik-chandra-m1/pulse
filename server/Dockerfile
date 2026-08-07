FROM node:22-slim AS base
WORKDIR /app

# Native module build deps for better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
RUN mkdir -p data

EXPOSE 4000
ENV NODE_ENV=production
CMD ["node", "src/index.js"]
