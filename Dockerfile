FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
ENV REFRESH_INTERVAL_MINUTES=30
ENV CACHE_MAX_AGE_SECONDS=60

EXPOSE 8080

CMD ["npm", "start"]
