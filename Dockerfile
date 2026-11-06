# Recipe for Render (or any Docker host): Node + yt-dlp + FFmpeg on Linux.
FROM node:22-slim

# FFmpeg from Debian, yt-dlp as the official standalone Linux binary (no Python needed).
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && apt-get purge -y curl && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public

ENV HOST=0.0.0.0
ENV PORT=10000
EXPOSE 10000
CMD ["node", "server.js"]
