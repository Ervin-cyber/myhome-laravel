# Stage 1: Build & Install dependencies
FROM php:8.5-fpm-alpine AS base

# Install necessary system dependencies
RUN apk add --no-cache \
    git \
    sqlite-dev \
    libzip-dev \
    $PHPIZE_DEPS \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && docker-php-ext-install pdo pdo_sqlite zip pcntl

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Set working directory inside the container
WORKDIR /var/www/html

# Copy application files (excluding those in .dockerignore)
COPY . .

COPY www.conf /usr/local/etc/php-fpm.d/www.conf

# Install PHP dependencies
RUN composer install --no-dev --optimize-autoloader

# Set appropriate permissions
RUN chown -R www-data:www-data /var/www/html/storage \
    && chmod -R 775 /var/www/html/storage