# Testing Guide

This package uses **Jest** for comprehensive testing to ensure reliability as companies depend on this package.

## Test Structure

```
test/
├── setup.ts                 # Database setup/teardown
├── helpers/
│   └── test-helpers.ts      # Reusable test utilities
├── utils/                   # Unit tests for utilities
│   ├── query-helpers.test.ts
│   └── error-handlers.test.ts
└── controllers/             # Integration tests for API endpoints
    └── api.test.ts
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests in CI mode (optimized for CI/CD)
npm run test:ci
```

## Test Coverage

The test suite covers:

### ✅ Critical Utilities (100% coverage target)
- **Query Helpers**: Time windows, date calculations, filter building
- **Error Handlers**: Timeout handling, error responses

### ✅ API Controllers
- **getLogs**: Pagination, filtering, regex endpoint handling
- **getLogById**: Single log retrieval, 404 handling
- **getMetrics**: Time range calculations, aggregations
- **getStatusDistribution**: Status code grouping
- **getSystemStats**: System resource monitoring
- **getStatusTrends**: Time window trends
- **getSlowEndpoints**: Performance analysis

## Test Database

Tests use **MongoDB Memory Server** for isolated, fast testing:
- No external MongoDB required
- Automatic setup/teardown
- Isolated test data
- Fast execution

## Writing New Tests

### Unit Test Example

```typescript
import { buildFilters } from "../../src/utils/query-helpers";

describe("buildFilters", () => {
  it("should build filters correctly", () => {
    const filters = buildFilters({ endpoint: "api/test" });
    expect(filters).toHaveProperty("endpoint");
  });
});
```

### Integration Test Example

```typescript
import { getLogs } from "../../src/controllers/api";
import { createMockRequest, createMockResponse } from "../helpers/test-helpers";

describe("getLogs", () => {
  it("should return logs", async () => {
    const req = createMockRequest() as Request;
    const res = createMockResponse() as Response;
    
    await getLogs(req, res);
    
    expect(res.json).toHaveBeenCalled();
  });
});
```

## Test Helpers

### `createMockRequest(overrides?)`
Creates a mock Express request object.

### `createMockResponse()`
Creates a mock Express response with jest spies.

### `createTestLogs(count)`
Creates test API log entries in the database.

### `getResponseData(res)`
Extracts JSON data from mocked response.

### `getStatusCode(res)`
Gets HTTP status code from mocked response.

## CI/CD Integration

The test suite is designed for CI/CD:

```yaml
# Example GitHub Actions
- name: Run tests
  run: npm run test:ci
```

## Best Practices

1. **Isolation**: Each test is independent
2. **Cleanup**: Database is cleared between tests
3. **Mocking**: Use mocks for external dependencies
4. **Coverage**: Aim for >80% coverage on critical paths
5. **Speed**: Tests should complete in <60 seconds

## Troubleshooting

### MongoDB Memory Server Timeout
If tests fail with timeout errors:
- Ensure you have sufficient disk space
- Check network connectivity (first run downloads MongoDB binary)
- Increase timeout in `jest.config.js` if needed

### Type Errors
Ensure TypeScript types are correct:
```bash
npm run build
```

## Coverage Reports

Coverage reports are generated in `coverage/` directory:
- HTML report: `coverage/index.html`
- LCOV report: `coverage/lcov.info`

