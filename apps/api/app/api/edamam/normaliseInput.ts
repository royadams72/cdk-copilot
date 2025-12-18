import OpenAI from "openai";

import { bad } from "@/apps/api/lib/http/responses";
import { NextResponse } from "next/server";

export type Item = {
  original: string;
  normalised: string;
  quantity: number;
  unit: string | null;
  food: string;
};
export type Normalised = {
  mealText: string; // original user input
  items: Item[];
};
export async function normaliseInput(
  input: string
): Promise<Normalised | NextResponse> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const normalise = `Normalise this meal description into the JSON format described above. "${input}"`;
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "developer",
          content: aiPrompt,
        },
        {
          role: "user",
          content: normalise,
        },
      ],
      model: "gpt-3.5-turbo",
      store: true,
    });

    const plan = completion.choices[0].message.content;
    if (!plan) {
      throw new Error("No Fitplan created");
    }

    const json = JSON.parse(plan);
    // console.log("jason", json);

    if (!json?.data) {
      bad("No data returned", "no data", 404);
    }

    return json;
  } catch (error) {
    return bad(`Create plan failure, ${error}`, 400);
  }
}

const aiPrompt = `You are a nutrition parsing assistant.

Your job is to take a free-text description of everything a person ate or drank, and normalise it into a list of ingredient items suitable for a nutrition database API.

Rules:
- Work at the level of individual ingredients or simple combined items (e.g. "ham sandwich" becomes "ham slices" as an item in items array and "white bread slices" as an item in items array, "chicken curry with rice" becomes "chicken curry" as an item in items array and "white rice" as an item in items array).
- Infer sensible quantities and units if missing (e.g. "a bowl of cereal" → 1 bowl cereal).
- Use everyday measures when possible: slice, cup, tablespoon, teaspoon, piece, can, bottle, gram, milliliter, ounce.
- Keep each ingredient's "normalized" text short but specific enough for a food database search.
- Do not include brand names unless they clearly matter (e.g. “Coca-Cola” vs “cola”).
- If something is too vague to be logged (e.g. “a snack”), omit it.
- Return ONLY valid JSON. Do not include any explanation, comments, or extra text.

Output JSON schema:
{
  "mealText": string,        // original user input
  "items": [
    {
      "original": string,    // exact fragment from the user text
      "normalised": string,  // cleaned phrase to send to a food database parser
      "quantity": number,    // numeric quantity (use 1 if unknown but clearly singular)
      "unit": string | null, // normalized unit like "slice", "cup", "tablespoon", or null if truly unitless
      "food": string         // core food name (no quantities or units)
    }
  ]
}`;

export function rewriteForEdamam(items: Item[]): Item[] {
  const out: Item[] = [];

  for (const item of items) {
    const text = item.normalised.toLowerCase().trim();
    const normalised = normaliseForEdamam(item.normalised);
    // const text = normaliseForEdamam(t);
    //     console.log("text rewrite", text);
    // 🔹 jerk chicken -> roast chicken thigh with skin
    if (text === "jerk chicken") {
      out.push({
        ...item,
        normalised: "roast chicken thigh with skin",
      });
      continue;
    }

    // 🔹 plantain rice -> split into rice + plantain
    if (text === "rice and peas") {
      out.push(
        {
          ...item,
          normalised: "boiled white rice",
          food: "white rice",
          quantity: 1,
          unit: "cup",
        },
        {
          ...item,
          normalised: "boiled kidney beans",
          food: "kidney beans",
          quantity: 0.5,
          unit: "cup",
        }
      );
      continue;
    }

    // 🔹 peas -> green peas
    if (text === "peas") {
      out.push({
        ...item,
        normalised: "green peas",
      });
      continue;
    }

    // 🔹 roast potatoes -> roast white potatoes
    if (text === "roast potatoes") {
      out.push({
        ...item,
        normalised: "roast white potatoes",
      });
      continue;
    }

    // default: keep as is
    out.push({ ...item, normalised });
  }
  // console.log("out2::::::", out);
  return out;
}

function normaliseForEdamam(text: string): string {
  const lower = text.toLowerCase();

  const mentionsSeeds = /\b(seed|seeds|pepita|pepitas)\b/i.test(lower);

  // Add more ingredients here as you discover issues
  const fleshFirstList = ["pumpkin", "butternut squash"];

  if (!mentionsSeeds) {
    for (const item of fleshFirstList) {
      const re = new RegExp(`\\b${item}\\b`, "i");
      if (re.test(lower) && /\broasted\b/i.test(lower)) {
        // strip roasted / baked / toasted etc. for Edamam
        return lower
          .replace(/\broasted\b/gi, "")
          .replace(/\btoasted\b/gi, "")
          .replace(/\bbaked\b/gi, "")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  return text;
}
