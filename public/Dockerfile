# Use a Debian-based Node image for broad architecture support
FROM node:20-bullseye

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

RUN rm -rf .next

# Copy the rest of the app
COPY . .

ARG NEXT_PUBLIC_REVERB_APP_KEY
ARG NEXT_PUBLIC_REVERB_HOST
ARG NEXT_PUBLIC_REVERB_PORT
ARG NEXT_PUBLIC_REVERB_SCHEME

ENV NEXT_PUBLIC_REVERB_APP_KEY=$NEXT_PUBLIC_REVERB_APP_KEY
ENV NEXT_PUBLIC_REVERB_HOST=$NEXT_PUBLIC_REVERB_HOST
ENV NEXT_PUBLIC_REVERB_PORT=$NEXT_PUBLIC_REVERB_PORT
ENV NEXT_PUBLIC_REVERB_SCHEME=$NEXT_PUBLIC_REVERB_SCHEME

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]