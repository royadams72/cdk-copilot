describe("Mobile Setup", () => {
  it("should have Jest configured for React Native", () => {
    expect(typeof describe).toBe("function");
  });

  it("should mock expo-secure-store", () => {
    const SecureStore = require("expo-secure-store");
    expect(SecureStore.getItemAsync).toBeDefined();
  });
});
