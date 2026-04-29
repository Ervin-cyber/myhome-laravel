# Use a Debian-based Node image for broad architecture support
FROM node:20-bullseye

# Copy env BEFORE build
COPY .env .env

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

RUN rm -rf .next

# Copy the rest of the app
COPY . .

# Build Next.js app
RUN npm run build

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]