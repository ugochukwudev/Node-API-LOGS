# Testing Infrastructure

## Overview

This package now includes a comprehensive, reliable test suite using **Jest** to ensure critical functionality works correctly as companies begin to rely on this package.

## Quick Start

```bash
# Run all tests
npm test

# Watch mode for development
npm run test:watch

# Coverage report
npm run test:coverage

# CI mode (optimized for continuous integration)
npm run test:ci
```

## Test Coverage

### ✅ Utilities (26 tests)
- **Query Helpers**: Time windows, date calculations, filter building, pagination
- **Error Handlers**: Timeout handling, error responses

### ✅ API Controllers (Integration Tests)
- **getLogs**: Pagination, filtering, regex endpoint handling, error cases
- **getLogById**: Single log retrieval, 404 handling
- **getMetrics**: Time range calculations, aggregations
- **getStatusDistribution**: Status code grouping with filters
- **getSystemStats**: System resource monitoring
- **getStatusTrends**: Time window trends and labels
- **getSlowEndpoints**: Performance analysis

## Test Infrastructure

### Database
- Uses **MongoDB Memory Server** for isolated testing
- No external dependencies required
- Automatic setup/teardown
- Fast execution

### Test Helpers
Reusable utilities in `test/helpers/test-helpers.ts`:
- `createMockRequest()` - Mock Express requests
- `createMockResponse()` - Mock Express responses
- `createTestLogs()` - Generate test data
- `getResponseData()` - Extract response data
- `getStatusCode()` - Get HTTP status codes

## CI/CD Ready

GitHub Actions workflow included (`.github/workflows/test.yml`):
- Runs on Node.js 18.x and 20.x
- Automated test execution
- Coverage reporting
- Ready for production CI/CD pipelines

## Reliability Features

1. **Isolated Tests**: Each test is independent with clean database state
2. **Type Safety**: Full TypeScript support with type checking
3. **Error Handling**: Comprehensive error scenario testing
4. **Edge Cases**: Tests cover boundary conditions and invalid inputs
5. **Performance**: Tests complete in <60 seconds

## Test Structure

```
test/
├── setup.ts                    # Database setup/teardown
├── helpers/
│   └── test-helpers.ts         # Reusable test utilities
├── utils/                      # Unit tests
│   ├── query-helpers.test.ts   # 26 tests
│   └── error-handlers.test.ts  # 5 tests
└── controllers/                # Integration tests
    └── api.test.ts             # API endpoint tests
```

## Best Practices

1. **Always test critical paths** - Query helpers, error handling
2. **Test edge cases** - Invalid inputs, boundary conditions
3. **Mock external dependencies** - Keep tests fast and isolated
4. **Maintain >80% coverage** - Especially on critical utilities
5. **Run tests before commits** - Use `npm run test:watch` during development

## Troubleshooting

### MongoDB Memory Server Issues
- First run downloads MongoDB binary (~70MB)
- Ensure sufficient disk space
- Check network connectivity

### Type Errors
```bash
npm run build  # Verify TypeScript compilation
```

## Next Steps

As the API grows, add tests for:
- New endpoints
- New utility functions
- Edge cases discovered in production
- Performance regressions

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Check coverage report
4. Update this document if needed

