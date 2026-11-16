FROM node:22-slim

WORKDIR /app

RUN useradd --create-home --shell /bin/bash appuser

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

COPY src ./src
COPY public ./public
RUN npm run build && npm prune --omit=dev

USER appuser

ENV KORAL_HOST=0.0.0.0 \
    KORAL_PORT=3000 \
    KORAL_DATA_DIR=/data

VOLUME ["/data"]
EXPOSE 3000

CMD ["node", "dist/server.js"]
