FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
# TZ decides which weekday counts as "today"; override it at run time if needed.
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321 DB_PATH=/data/gym.db TZ=Europe/Madrid
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
VOLUME /data
EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
