This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```
## drizzle SQLITE Database
npx drizzle-kit generate
npx drizzle-kit push

## django 
python manage.py makemigrations
python manage.py migrate

## Dockerfile
# 1. Build stage
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# 2. Production stage
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /app ./

ENV NODE_ENV production
EXPOSE 3000

CMD ["npm", "start"]

## PC
docker buildx create --use
docker buildx build --platform linux/arm64 -t myhome:pi --load .

docker tag myhome:pi ervinpap/myhome:pi
docker push ervinpap/myhome:pi

## PI
docker pull ervinpap/myhome:pi
docker run -p 3000:3000 ervinpap/myhome:pi

php artisan migrate:fresh --seed


