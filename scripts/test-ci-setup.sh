#!/bin/bash
set -e

echo "Testing CI Docker Setup..."
echo "========================="

# Build and start services
echo "1. Building and starting Docker services..."
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build

# Wait for services to be healthy
echo "2. Waiting for services to become healthy..."
.github/scripts/wait-for-healthy-services.sh

# Test service endpoints
echo "3. Testing service endpoints..."
echo "Testing /status endpoint..."
if ! curl -f http://localhost:3000/status; then
  echo "Error: Failed to reach /status endpoint. Exiting."
  exit 1
fi
echo "/status endpoint test passed."

echo "Testing root endpoint..."
if ! curl -f http://localhost:3000/; then
  echo "Error: Failed to reach root endpoint. Exiting."
  exit 1
fi
echo "Root endpoint test passed."

# Validate configuration
echo "4. Validating configuration..."
docker compose -f docker-compose.yml -f docker-compose.ci.yml run --rm tbtc-relayer-dev yarn run validate-config:test

# Clean up
echo "5. Cleaning up..."
docker compose -f docker-compose.yml -f docker-compose.ci.yml down

echo "✅ CI Docker setup test completed successfully!" 