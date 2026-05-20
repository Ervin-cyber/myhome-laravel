#!/bin/bash

# Configuration - update these if needed
DOCKER_USERNAME="ervinpap" # Based on your repo history

echo "🚀 Starting manual build and push..."

# 1. Build and Push API
echo "📦 Building API (Laravel)..."
docker build -t $DOCKER_USERNAME/laravel:latest ./api
echo "⬆️ Pushing API..."
docker push $DOCKER_USERNAME/laravel:latest

# 2. Build and Push Frontend
echo "📦 Building Frontend (Next.js)..."
docker build \
  --build-arg NEXT_PUBLIC_REVERB_APP_KEY=85r6cbqutni8angnhqkd \
  --build-arg NEXT_PUBLIC_REVERB_HOST=home.papstack.net \
  --build-arg NEXT_PUBLIC_REVERB_PORT=443 \
  --build-arg NEXT_PUBLIC_REVERB_SCHEME=https \
  -t $DOCKER_USERNAME/nextjs-frontend:latest ./public
echo "⬆️ Pushing Frontend..."
docker push $DOCKER_USERNAME/nextjs-frontend:latest

echo "✅ Done! Watchtower will pick up the changes on your Pi shortly."
