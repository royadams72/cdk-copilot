import OpenAI from "openai";

import { bad } from "@/apps/api/lib/http/responses";
import { NextResponse } from "next/server";
import { TLogMealItem, TLogMealNormalised } from "@ckd/core";

export async function normaliseInput(
  input: string,
): Promise<TLogMealNormalised | NextResponse> {
  const directBreadMatch = buildDirectBreadNormalisation(input);
  if (directBreadMatch) {
    return directBreadMatch;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const normalise = `Normalise this meal description into the JSON format described above. "${input}"`;
  try {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          content: aiPrompt,
          role: "developer",
        },
        {
          content: normalise,
          role: "user",
        },
      ],
      model: "gpt-3.5-turbo",
      store: true,
    });

    const plan = completion.choices[0].message.content;
    if (!plan) {
      throw new Error("No Fitplan created");
    }

    const json = JSON.parse(plan) as TLogMealNormalised;
    // console.log("jason", json);

    if (!json) {
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
- Preserve explicit product descriptors that help search quality, including variety/type words such as "basmati", "wholemeal", "seeded", and "reduced salt".
- Preserve explicit brand names when the user typed them (e.g. "Birds Eye peas" should stay branded rather than being reduced to just "peas").
- Do not invent brand names if the user did not provide one.
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

function buildDirectBreadNormalisation(
  input: string,
): TLogMealNormalised | null {
  const cleaned = input.toLowerCase().trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const isBreadStyleQuery =
    /^(brown|wholemeal|whole meal|wholegrain|whole grain|wholewheat|whole wheat|granary)( bread)?$/.test(
      cleaned,
    );

  if (!isBreadStyleQuery) return null;

  return {
    items: [
      {
        food: "whole wheat bread",
        normalised: "whole wheat bread",
        original: input,
        quantity: 1,
        unit: "slice",
      },
    ],
    mealText: input,
  };
}

export function rewriteForEdamam(items: TLogMealItem[]): TLogMealItem[] {
  const out: TLogMealItem[] = [];

  for (const item of items) {
    const text = item.normalised.toLowerCase().trim();
    const breadRewrite = rewriteBreadForEdamam(item);
    if (breadRewrite) {
      out.push({
        ...item,
        food: breadRewrite,
        normalised: breadRewrite,
      });
      continue;
    }

    const normalised = normaliseForEdamam(item.normalised);
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
          food: "white rice",
          normalised: "boiled white rice",
          quantity: 1,
          unit: "cup",
        },
        {
          ...item,
          food: "kidney beans",
          normalised: "boiled kidney beans",
          quantity: 0.5,
          unit: "cup",
        },
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

  return out;
}

function normaliseForEdamam(text: string): string {
  const lower = text
    .toLowerCase()
    .replace(/\btinned\b/g, "canned")
    .replace(/\btin\b/g, "can");

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

  return lower.replace(/\s+/g, " ").trim();
}

function rewriteBreadForEdamam(item: TLogMealItem) {
  const source = [item.original, item.normalised, item.food]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const mentionsBread =
    /\bbread\b/.test(source) || item.normalised.toLowerCase() === "bread";
  if (!mentionsBread) return null;

  if (/\bbrown bread\b/.test(source)) {
    return "whole wheat bread";
  }

  if (
    /\b(wholemeal|whole meal|wholegrain|whole grain|wholewheat|whole wheat|granary)\b/.test(
      source,
    )
  ) {
    return "whole wheat bread";
  }

  return null;
}
