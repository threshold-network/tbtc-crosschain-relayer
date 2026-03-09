# Threshold Network | tBTC Cross-Chain Relayer

Based on [L2 tBTC SDK Relayer Implementation](https://thresholdnetwork.notion.site/L2-tBTC-SDK-Relayer-Implementation-4dfedabfcf594c7d8ef80609541cf791?pvs=4)

## Table of Contents

- [Threshold Network | tBTC Cross-Chain Relayer](#threshold-network--tbtc-cross-chain-relayer)
  - [Table of Contents](#table-of-contents)
  - [Project Overview](#project-overview)
  - [Docker Setup](#docker-setup)
  - [How to Start the Project (Local)](#how-to-start-the-project-local)
    - [Development Mode](#development-mode)
  - [Project Scripts](#project-scripts)
  - [CI - GitHub Actions](#ci---github-actions)
  - [Database Management](#database-management)
    - [Automatic Migrations](#automatic-migrations)
    - [Manual Migration](#manual-migration)
    - [Backup Database](#backup-database)
    - [Restore Database](#restore-database)
  - [Testing](#testing)
    - [Test Database Setup](#test-database-setup)
    - [Running Tests](#running-tests)

## Project Overview

This project is built with NodeJS and includes a variety of libraries to facilitate development. The project is configured to use Docker for easy setup and deployment.

## Docker Setup

To run the project in a development environment using Docker, follow these steps:

1. Create a `.env` file:

```bash
cp .env.example .env
```

2. Start the Docker container:

```bash
docker compose up --build
```

3. Access the application:

- Once the container is running, the application should be accessible on your host machine at `http://localhost:${PORT}`.
- The service uses `ts-node-dev` for hot-reloading, so changes you make to your TypeScript source code will automatically trigger a server restart within the container.

## How to Start the Project (Local)

### Development Mode

To start the application in development mode, run:

```bash
yarn dev
```

## Project Scripts

The following yarn scripts are avaliable:

    -   `yarn dev`: Runs the application in development mode.
    -   `yarn start`: Runs the application in production mode

## CI - GitHub Actions

You can run the CI workflow locally by running:

```bash
gh act
```

## Database Management

### Automatic Migrations
Migrations are run automatically when the app starts in Docker (production mode) using an entrypoint script.

### Manual Migration
To run migrations manually:
```bash
yarn db:migrate
```

### Backup Database
To create a backup (PostgreSQL):
```bash
yarn db:backup
```

### Restore Database
To restore from a backup:
```bash
yarn db:restore
```

## Testing

Tests are run using Jest. Integration and End-to-End (E2E) tests require the Docker services, including the PostgreSQL database (on port 5432), to be running. You can start these services using:

```bash
docker compose -f docker-compose.yml -f docker-compose.ci.yml up -d --build
```

In the CI environment, the database is automatically reset before tests. For local testing, you might need to manage your database state manually or use the `yarn db:reset` script if you need a clean slate:

```bash
yarn db:reset
```

### Running Tests

The following commands can be used to run tests:

```bash
# Run all tests (unit, integration, and E2E)
# Ensure Docker services are running for integration/E2E tests
yarn test

# Run only unit tests (do not require Docker services)
yarn test:unit

# Run only integration tests (requires Docker services)
yarn test:integration

# Run only End-to-End (E2E) tests (requires Docker services)
yarn test:e2e

# Generate a test coverage report
yarn test:coverage

# Run tests in watch mode
yarn test:watch

# Run a specific test file (example)
# Replace with the actual path to your test file
yarn test tests/integration/controllers/Endpoint.controller.test.ts
```

**Note:** For integration and E2E tests, ensure your Docker services (especially the database) are up and running. If you encounter issues with data from previous test runs, consider resetting your database.
