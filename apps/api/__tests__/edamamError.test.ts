import {
  createEdamamProviderError,
  EdamamProviderError,
} from "../app/api/food/edamamError";

describe("Edamam provider errors", () => {
  it("maps upstream 401 to a provider authentication failure", async () => {
    const response = new Response("Unauthorized", { status: 401 });

    const error = await createEdamamProviderError(response, "food search");

    expect(error).toBeInstanceOf(EdamamProviderError);
    expect(error.status).toBe(502);
    expect(error.upstreamStatus).toBe(401);
    expect(error.message).toBe("Edamam authentication failed during food search");
    expect(error.details).toBe("Unauthorized");
  });

  it("maps upstream 429 to a provider rate limit failure", async () => {
    const response = new Response("Too many requests", { status: 429 });

    const error = await createEdamamProviderError(response, "food lookup");

    expect(error.status).toBe(502);
    expect(error.upstreamStatus).toBe(429);
    expect(error.message).toBe("Edamam rate limit exceeded during food lookup");
    expect(error.details).toBe("Too many requests");
  });
});
