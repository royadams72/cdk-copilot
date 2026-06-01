# Jest Testing Setup

This project uses Jest for unit testing across all packages (API, mobile, core, and networking).

## Running Tests

### All Tests

```bash
pnpm test
```

Runs all tests across all packages sequentially.

### Individual Package Tests

```bash
# API tests (Next.js)
pnpm --filter api test

# Mobile tests (React Native/Expo)
pnpm --filter mobile test

# Core package tests (shared schemas/utilities)
pnpm --filter @ckd/core test

# Networking package tests (fetch wrapper)
pnpm --filter networking test
```

### Watch Mode

```bash
# Watch tests in API (can be updated to watch other packages)
pnpm --filter api test:watch
```

## Project Structure

- **apps/api/**tests**/** — Next.js API route tests
- **apps/mobile/**tests**/** — React Native component and hook tests
- **packages/core/src/**tests**/** — Zod schema and utility tests
- **packages/networking/**tests**/** — Fetch wrapper tests

## Configuration Files

Each package has its own Jest configuration:

- **jest.config.js** — Jest configuration (preset, modules, transforms)
- **jest.setup.js** — Setup file with mocks and environment variables (API and mobile only)
- **tsconfig.json** — TypeScript configuration (referenced by ts-jest)

## Mocking Patterns

### API (Next.js)

- Environment variables are pre-set in `jest.setup.js`
- Database and external services can be mocked with `jest.mock()`
- Next.js modules (NextRequest, NextResponse) are pre-mocked

Example:

```typescript
jest.mock("mongodb", () => ({
  MongoClient: jest.fn(),
  ObjectId: jest.fn(),
}));
```

### Mobile (React Native)

- Expo SecureStore is mocked to return null by default
- Redux Persist is mocked to pass through reducer
- Expo modules (constants, linking, async-storage) are mocked
- Custom mocks can be added in `jest.setup.js`

Example:

```typescript
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async (key) => {
    // Return mock values per key
    if (key === "ckd_jwt") return "mock-token";
    return null;
  }),
  setItemAsync: jest.fn(async () => {}),
}));
```

### Core (Schemas)

- Pure TypeScript/Zod tests with minimal mocking needed
- Use `.safeParse()` for validation assertions

Example:

```typescript
import { MeasurementCreate } from "core";

describe("Measurement Schema", () => {
  it("should validate valid weight measurements", () => {
    const result = MeasurementCreate.safeParse({
      kind: "weight",
      valueKg: 75,
      measuredAt: new Date(),
    });
    expect(result.success).toBe(true);
  });
});
```

### Networking (Fetch Wrapper)

- Global fetch can be mocked with jest.mock or jest-fetch-mock
- Test error handling, retries, and envelope unwrapping

Example:

```typescript
global.fetch = jest.fn(async () => ({
  ok: true,
  json: async () => ({ ok: true, data: {} }),
}));
```

## Writing Tests

### Test File Naming

Tests should match one of these patterns:

- `**/__tests__/**/*.test.ts` (TypeScript)
- `**/__tests__/**/*.test.tsx` (React/JSX)
- `**/*.spec.ts` (Alternative pattern)

### Basic Test Structure

```typescript
describe("Feature Name", () => {
  beforeEach(() => {
    // Setup before each test
  });

  it("should do something", () => {
    // Arrange
    const input = {
      /* ... */
    };

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toEqual(expectedValue);
  });

  afterEach(() => {
    // Cleanup after each test
    jest.clearAllMocks();
  });
});
```

## Common Testing Scenarios

### Testing API Routes

```typescript
import { POST } from "@/app/api/endpoint/route";

describe("POST /api/endpoint", () => {
  it("should return 200 with valid input", async () => {
    const mockRequest = new Request("http://localhost/api/endpoint", {
      method: "POST",
      body: JSON.stringify({
        /* data */
      }),
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });
});
```

### Testing React Components

```typescript
import { render, screen } from '@testing-library/react-native';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  it('should render text', () => {
    render(<MyComponent />);
    expect(screen.getByText('Expected Text')).toBeTruthy();
  });
});
```

### Testing Redux Slices

```typescript
import store from "@/store";
import { fetchData } from "@/store/slices/dataSlice";

describe("Data Slice", () => {
  it("should handle fetchData fulfilled", async () => {
    const mockData = {
      /* ... */
    };
    // Dispatch action and test state
    await store.dispatch(fetchData());
    const state = store.getState().data;
    expect(state.loaded).toBe(true);
  });
});
```

### Testing Zod Schemas

```typescript
import { MeasurementCreate } from "core";

describe("MeasurementCreate Schema", () => {
  it("should reject invalid data", () => {
    const result = MeasurementCreate.safeParse({
      kind: "weight",
      valueKg: -10, // Invalid: negative weight
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].code).toBe("too_small");
  });
});
```

## Debugging Tests

### Run Single Test File

```bash
pnpm --filter api test -- __tests__/setup.test.ts
```

### Run Tests Matching Pattern

```bash
pnpm --filter api test -- --testNamePattern="should have Jest"
```

### Debug with Node Inspector

```bash
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Coverage

Currently coverage is not enforced. To add coverage reporting, update jest configs to include:

```javascript
collectCoverage: true,
coverageThreshold: {
  global: {
    branches: 50,
    functions: 50,
    lines: 50,
    statements: 50,
  },
},
```

## Troubleshooting

### ts-jest Warning: `isolatedModules` Deprecated

This warning can be ignored for now or silenced by adding `isolatedModules: true` to each package's tsconfig.json compiler options.

### Watchman Warnings

If you see watchman warnings, you can clear them:

```bash
watchman watch-del '/Users/royadams/Sites/ckd-copilot'
watchman watch-project '/Users/royadams/Sites/ckd-copilot'
```

### Module Resolution Errors

Ensure `moduleNameMapper` in jest.config.js matches your tsconfig.json path aliases. Check that workspace packages are correctly resolved through `../../packages/` paths.

## Next Steps

1. Write tests for existing critical functions
2. Add tests to your development workflow (pre-commit hooks)
3. Set coverage thresholds as needed
4. Integrate with CI/CD pipeline (GitHub Actions, etc.)
