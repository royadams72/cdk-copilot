describe("API Setup", () => {
  it("should have Jest configured", () => {
    expect(process.env.JWT_SECRET).toBeDefined();
  });

  it("should have test environment as node", () => {
    expect(typeof process).toBe("object");
  });
});
