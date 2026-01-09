import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { quantity, foodId } = await req.json();
  const body = {
    ingredients: [
      {
        quantity: 0,
        measureURI: "string",
        qualifiers: ["string"],
        foodId: "string",
      },
    ],
  };
}
