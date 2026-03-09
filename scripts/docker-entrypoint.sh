#!/bin/sh
set -e

echo "🚀 Starting tBTC Relayer container..."
echo "📊 Node version: $(node --version)"
echo "📦 NPM version: $(npm --version)"

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL environment variable is not set"
    exit 1
fi

echo "🗄️  Database URL configured (first 20 chars): ${DATABASE_URL:0:20}..."

# Wait for database to be ready with retries
echo "🔍 Waiting for database to be ready..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    echo "🔄 Database connection attempt $attempt/$max_attempts..."
    
    # Try a simple connection test using psql if available, otherwise use prisma
    if command -v psql >/dev/null 2>&1; then
        if echo "SELECT 1;" | psql "$DATABASE_URL" >/dev/null 2>&1; then
            echo "✅ Database connection successful"
            break
        fi
    else
        # Fallback to prisma with a simple command
        if npx prisma migrate status >/dev/null 2>&1; then
            echo "✅ Database connection successful"
            break
        fi
    fi
    
    if [ $attempt -eq $max_attempts ]; then
        echo "❌ ERROR: Cannot connect to database after $max_attempts attempts"
        echo "🔧 Troubleshooting tips:"
        echo "   - Check if DATABASE_URL is correct"
        echo "   - Verify database server is running and accessible"
        echo "   - Check network connectivity"
        echo "   - Ensure database credentials are valid"
        exit 1
    fi
    
    echo "⏳ Waiting 2 seconds before next attempt..."
    sleep 2
    attempt=$((attempt + 1))
done

# Run database migrations
echo "🔄 Running database migrations..."
if npx prisma migrate deploy; then
    echo "✅ Database migrations completed successfully"
else
    echo "❌ ERROR: Database migrations failed"
    echo "🔧 Troubleshooting tips:"
    echo "   - Check if migration files exist:"
    ls -la /usr/app/prisma/migrations/ 2>/dev/null || echo "   - Migration directory not found at /usr/app/prisma/migrations/"
    echo "   - Verify database permissions for schema changes"
    echo "   - Check migration file integrity"
    echo "   - Ensure database user has CREATE/ALTER privileges"
    exit 1
fi

# Optional: Verify tables exist (non-blocking)
echo "🔍 Verifying database schema..."
if npx prisma migrate status | grep -q "up to date"; then
    echo "✅ Database schema is up to date"
else
    echo "⚠️  Warning: Database schema status unclear, but continuing..."
fi

echo "🎯 Starting application..."
# Start the app (forward all arguments from Dockerfile CMD)
exec "$@" 
