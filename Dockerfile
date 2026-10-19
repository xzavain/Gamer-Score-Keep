FROM node:20-alpine

# Build tools for better-sqlite3 (prebuilds cover most platforms; fallback)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# SQLite database lives here; mount a persistent volume
VOLUME /app/data

EXPOSE 3000
ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "server.js"]
