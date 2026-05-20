# Stage 1: Build & Install dependencies
FROM php:8.4-fpm-alpine AS builder

# Install necessary system dependencies for building
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

WORKDIR /var/www/html

# Copy ONLY composer files first to leverage Docker cache
COPY composer.json composer.lock ./

# Install PHP dependencies
RUN composer install --no-dev --no-scripts --no-autoloader

# Copy the rest of the application files
COPY . .

# Finalize autoloader
RUN composer dump-autoload --optimize --no-dev

# Stage 2: Production Runner
FROM php:8.4-fpm-alpine

# Install only runtime dependencies
RUN apk add --no-cache \
    sqlite-libs \
    libzip

# Copy PHP extensions from builder
COPY --from=builder /usr/local/lib/php/extensions /usr/local/lib/php/extensions
COPY --from=builder /usr/local/etc/php/conf.d /usr/local/etc/php/conf.d

WORKDIR /var/www/html

# Copy application from builder
COPY --from=builder /var/www/html /var/www/html

COPY www.conf /usr/local/etc/php-fpm.d/www.conf

# Set appropriate permissions
RUN chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R 775 /var/www/html/storage /var/www/html/bootstrap/cache

USER www-data

EXPOSE 9000

CMD ["php-fpm"]
