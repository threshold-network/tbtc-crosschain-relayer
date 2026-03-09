# tBTC Cross-Chain Relayer Testing Framework

This directory contains a comprehensive testing framework for the tBTC Cross-Chain Relayer. The tests are organized into three main categories:

1. **Unit Tests**: Testing individual functions and components in isolation
2. **Integration Tests**: Testing interactions between components
3. **End-to-End Tests**: Testing complete workflows and API endpoints

## Directory Structure

```
tests/
├── data/                 # Test data directory
├── logs/                 # Test logs directory
├── e2e/                  # End-to-end tests
├── integration/          # Integration tests
├── mocks/                # Mock implementations
│   ├── BlockchainMock.ts # Mock blockchain providers and contracts
│   └── MockChainHandler.ts # Mock chain handler
├── setup.ts              # Test setup file
├── unit/                 # Unit tests
│   ├── utils/            # Tests for utility functions
│   ├── services/         # Tests for services
│   └── ...               # Other unit tests
└── README.md             # This file
```

## Running Tests

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

Install dependencies:

```bash
npm install
```

### Running Tests

You can run tests using these commands:

```bash
# Run all tests
npm test

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:e2e

# Run with coverage report
npm run test:coverage
```

## Test Categories

### Unit Tests

Unit tests focus on testing individual functions and modules in isolation. They use mocks to simulate dependencies and are designed to be fast and reliable.

Example:

```typescript
// Testing JsonUtils functions
describe('JsonUtils', () => {
  test('should write and read a JSON file', () => {
    // Test implementation
  });
});
```

### Integration Tests

Integration tests verify that different components of the system work correctly together. They test interactions between modules, such as controllers and services.

Example:

```typescript
// Testing EndpointController with MockChainHandler
describe('EndpointController', () => {
  test('should handle reveal requests', async () => {
    // Test implementation
  });
});
```

### End-to-End Tests

End-to-end tests verify complete workflows from a user's perspective. They test API endpoints and simulate user interactions with the system.

Example:

```typescript
// Testing API endpoints
describe('API Endpoints', () => {
  test('should process a complete deposit lifecycle', async () => {
    // Test implementation
  });
});
```

## Mocks

The testing framework includes several mock implementations:

- **MockChainHandler**: Implements the ChainHandlerInterface for testing
- **BlockchainMock**: Provides mock implementations of blockchain providers and contracts
- **MockProvider**: Simulates an Ethereum provider
- **MockContract**: Simulates a contract instance

These mocks can be used to simulate various scenarios, including error conditions and edge cases.

## Test Data

Test data is stored in the `tests/data/` directory. This directory is created automatically when running tests and is cleaned up after tests complete.

## Test Logs

Test logs are stored in the `tests/logs/` directory. This directory is created automatically when running tests and is cleaned up after tests complete.

## Best Practices

When writing tests:

1. **Isolate Tests**: Each test should be independent and not rely on state from other tests
2. **Use Descriptive Names**: Test names should clearly describe what is being tested
3. **Follow AAA Pattern**: Arrange, Act, Assert
4. **Clean Up**: Clean up resources after tests complete
5. **Test Edge Cases**: Include tests for error conditions and edge cases
6. **Keep Tests Fast**: Tests should run quickly to provide fast feedback
7. **Use Mocks Appropriately**: Use mocks to isolate components and simulate dependencies
