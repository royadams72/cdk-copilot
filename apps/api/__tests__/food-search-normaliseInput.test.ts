import {
  normaliseInput,
  rewriteForEdamam,
} from "../app/api/food/search/normaliseInput";

describe("food/search normaliseInput", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
      return;
    }

    process.env.OPENAI_API_KEY = originalApiKey;
  });

  it("parses measured single-ingredient input without OpenAI", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    await expect(normaliseInput("100g of carrots")).resolves.toEqual({
      items: [
        {
          food: "carrots",
          normalised: "carrots",
          original: "100g of carrots",
          quantity: 100,
          unit: "gram",
        },
      ],
      mealText: "100g of carrots",
    });
  });

  it("parses counted servings into quantity, unit, and food", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(normaliseInput("2 slices wholemeal bread")).resolves.toEqual({
      items: [
        {
          food: "wholemeal bread",
          normalised: "wholemeal bread",
          original: "2 slices wholemeal bread",
          quantity: 2,
          unit: "slice",
        },
      ],
      mealText: "2 slices wholemeal bread",
    });
  });

  it("parses multiple simple measured foods without OpenAI", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    await expect(
      normaliseInput("100g of carrots and 50g of rice"),
    ).resolves.toEqual({
      items: [
        {
          food: "carrots",
          normalised: "carrots",
          original: "100g of carrots",
          quantity: 100,
          unit: "gram",
        },
        {
          food: "rice",
          normalised: "rice",
          original: "50g of rice",
          quantity: 50,
          unit: "gram",
        },
      ],
      mealText: "100g of carrots and 50g of rice",
    });
  });

  it("parses simple single-food searches with no quantity", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(normaliseInput("basmati rice")).resolves.toEqual({
      items: [
        {
          food: "basmati rice",
          normalised: "basmati rice",
          original: "basmati rice",
          quantity: 1,
          unit: null,
        },
      ],
      mealText: "basmati rice",
    });
  });

  it("rewrites plain rice searches toward cooked rice", () => {
    expect(
      rewriteForEdamam([
        {
          food: "rice",
          normalised: "rice",
          original: "rice",
          quantity: 200,
          unit: "gram",
        },
      ]),
    ).toEqual([
      {
        food: "white rice",
        normalised: "boiled white rice",
        original: "rice",
        quantity: 200,
        unit: "gram",
      },
    ]);
  });
});
