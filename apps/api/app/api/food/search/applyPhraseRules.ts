type EdamamHint = { food: { label: string; categoryLabel?: string } };

export function applyPhraseRules(
  text: string,
  pool: EdamamHint[]
): EdamamHint | null {
  // const lowerText = text.toLowerCase();

  const rules: { pattern: RegExp; labelPattern: RegExp }[] = [
    // wholemeal / wholegrain / brown bread etc.
    {
      pattern: /\b(brown|wholemeal|whole[- ]wheat|wholegrain|granary)\b/i,
      labelPattern: /\b(brown|wholemeal|whole[- ]wheat|wholegrain|granary)\b/i,
    },
    // white staple (bread, toast, roll, rice, pasta)
    {
      pattern: /\bwhite (bread|toast|roll|bap|bun|rice|pasta)\b/i,
      labelPattern: /\bwhite (bread|toast|roll|bap|bun|rice|pasta)\b/i,
    },
    // no added salt / unsalted
    {
      pattern: /\b(no added salt|without salt|unsalted)\b/i,
      labelPattern: /\b(no added salt|unsalted|without salt)\b/i,
    },
    // reduced / low salt
    {
      pattern: /\b(low|reduced) salt\b/i,
      labelPattern: /\b(low|reduced) salt\b/i,
    },
    // in brine
    {
      pattern: /\b(in|in a) brine\b/i,
      labelPattern: /\bbrine\b/i,
    },
    // in water / spring water
    {
      pattern: /\b(in|in spring) water\b/i,
      labelPattern: /\b(in water|in spring water)\b/i,
    },
    // milk fat levels
    {
      pattern: /\bsemi[- ]skimmed\b/i,
      labelPattern: /\bsemi[- ]skimmed\b/i,
    },
    {
      pattern: /\bskimmed\b/i,
      labelPattern: /\bskimmed\b/i,
    },
    {
      pattern: /\b(whole|full[- ]fat)\b.*\bmilk\b/i,
      labelPattern: /\b(whole|full[- ]fat)\b.*\bmilk\b/i,
    },
    // lean meat
    {
      pattern: /\b(lean|extra lean)\b/i,
      labelPattern: /\b(lean|trimmed)\b/i,
    },
    // cooking methods
    {
      pattern: /\bdeep[- ]fried\b/i,
      labelPattern: /\bdeep[- ]fried\b/i,
    },
    {
      pattern: /\bfried\b/i,
      labelPattern: /\bfried\b/i,
    },
    {
      pattern: /\bgrilled\b/i,
      labelPattern: /\bgrilled\b/i,
    },
    {
      pattern: /\broasted\b/i,
      labelPattern: /\broasted\b/i,
    },
    {
      pattern: /\bbaked\b/i,
      labelPattern: /\bbaked\b/i,
    },
    {
      pattern: /\bboiled\b/i,
      labelPattern: /\bboiled\b/i,
    },
    {
      pattern: /\bsteamed\b/i,
      labelPattern: /\bsteamed\b/i,
    },
    // skin / bone
    {
      pattern: /\bskinless\b/i,
      labelPattern: /\bskinless\b/i,
    },
    {
      pattern: /\bwith skin\b/i,
      labelPattern: /\b(with skin|skin[- ]on)\b/i,
    },
    // sugar-related
    {
      pattern: /\b(no added sugar|unsweetened)\b/i,
      labelPattern: /\b(no added sugar|unsweetened)\b/i,
    },
    {
      pattern: /\b(sugar[- ]free|diet|zero)\b/i,
      labelPattern: /\b(sugar[- ]free|diet|zero)\b/i,
    },
  ];

  const lowerText = text.toLowerCase();
  const userMentionedSeeds = /\bseed(s)?\b/i.test(lowerText);
  // console.log("userMentionedSeeds::", userMentionedSeeds);

  for (const rule of rules) {
    if (!rule.pattern.test(lowerText)) continue;

    // All hints whose labels match this rule
    const matches = pool.filter((h) => rule.labelPattern.test(h.food.label));
    // console.log(`matches apply for ${lowerText}::`, matches);
    if (!matches.length) continue;

    let hit: EdamamHint | null = null;

    if (!userMentionedSeeds) {
      // Prefer non-seed matches when the user didn't say "seeds"
      const nonSeedMatches = matches.filter(
        (h) => !/\b(seed|pepita)s?\b/i.test(h.food.label)
      );
      if (nonSeedMatches.length) {
        // great, we found a non-seed roasted option
        hit = nonSeedMatches[0];
      } else {
        // all matches are seeds; don't force a seed via this phrase rule
        // let the rest of the logic (or the generic fallback) decide
        // console.log("hit0::", hit);
        continue;
      }
    } else {
      // User explicitly mentioned seeds – any roasted seed match is fine
      hit = matches[0];
    }

    if (hit) return hit;
  }

  return null;
}
