// Set environment variables for testing
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-secret-key-do-not-use-in-production";
process.env.MONGODB_URI_APP =
  process.env.MONGODB_URI_APP || "mongodb://localhost:27017/ckd-copilot-test";
process.env.MONGODB_URI_ANALYTICS_RO =
  process.env.MONGODB_URI_ANALYTICS_RO ||
  "mongodb://localhost:27017/ckd-copilot-analytics-test";
process.env.VERIFY_URL =
  process.env.VERIFY_URL || "http://localhost:3000/verify";
process.env.APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";

// Mock Next.js specific modules if needed
jest.mock(
  "next/server",
  () => ({
    NextRequest: class NextRequest {},
    NextResponse: class NextResponse {
      static json = jest.fn((data) => ({ json: () => Promise.resolve(data) }));
    },
  }),
  { virtual: true },
);
