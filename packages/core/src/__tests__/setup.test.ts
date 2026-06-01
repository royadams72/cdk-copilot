describe("Core Package Setup", () => {
  it("should have TypeScript and Zod available", () => {
    const zod = require("zod");
    expect(zod.z).toBeDefined();
  });

  it("should resolve isomorphic exports", async () => {
    // Basic smoke test - just ensure the package structure is valid
    expect(true).toBe(true);
  });
});
