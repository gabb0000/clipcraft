#!/usr/bin/env bash
# Render build script

set -e

echo "📦 Installing dependencies..."
npm install

echo "🔧 Installing FFmpeg..."
apt-get update
apt-get install -y ffmpeg

echo "📥 Installing yt-dlp..."
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp
chmod a+rx /usr/local/bin/yt-dlp

echo "🏗️ Building application..."
npm run build

echo "✅ Build complete!"
