type EdamamHint = { food: { categoryLabel?: string; label: string } };

export function applyPhraseRules(
  text: string,
  pool: EdamamHint[],
): EdamamHint | null {
  const rules: { labelPattern: RegExp; pattern: RegExp }[] = [
    // wholemeal / wholegrain / brown bread etc.
    {
      labelPattern:
        /\b(brown|whole meal|wholemeal|whole[- ]meal||whole[- ]wheat|wholegrain|whole grain|granary)\b/i,
      pattern:
        /\b(brown|whole meal|wholemeal|whole[- ]meal||whole[- ]wheat|wholegrain|whole grain|granary)\b/i,
    },
    // white staple (bread, toast, roll, rice, pasta)
    {
      labelPattern: /\bwhite (bread|toast|roll|bap|bun|rice|pasta)\b/i,
      pattern: /\bwhite (bread|toast|roll|bap|bun|rice|pasta)\b/i,
    },
    // no added salt / unsalted
    {
      labelPattern: /\b(no added salt|unsalted|without salt)\b/i,
      pattern: /\b(no added salt|without salt|unsalted)\b/i,
    },
    // reduced / low salt
    {
      labelPattern: /\b(low|reduced) salt\b/i,
      pattern: /\b(low|reduced) salt\b/i,
    },
    // in brine
    {
      labelPattern: /\bbrine\b/i,
      pattern: /\b(in|in a) brine\b/i,
    },
    // in water / spring water
    {
      labelPattern: /\b(in water|in spring water)\b/i,
      pattern: /\b(in|in spring) water\b/i,
    },
    // milk fat levels
    {
      labelPattern: /\bsemi[- ]skimmed\b/i,
      pattern: /\bsemi[- ]skimmed\b/i,
    },
    {
      labelPattern: /\bskimmed\b/i,
      pattern: /\bskimmed\b/i,
    },
    {
      labelPattern: /\b(whole|full[- ]fat)\b.*\bmilk\b/i,
      pattern: /\b(whole|full[- ]fat)\b.*\bmilk\b/i,
    },
    // lean meat
    {
      labelPattern: /\b(lean|trimmed)\b/i,
      pattern: /\b(lean|extra lean)\b/i,
    },
    // cooking methods
    {
      labelPattern: /\bdeep[- ]fried\b/i,
      pattern: /\bdeep[- ]fried\b/i,
    },
    {
      labelPattern: /\bfried\b/i,
      pattern: /\bfried\b/i,
    },
    {
      labelPattern: /\bgrilled\b/i,
      pattern: /\bgrilled\b/i,
    },
    {
      labelPattern: /\broasted\b/i,
      pattern: /\broasted\b/i,
    },
    {
      labelPattern: /\bbaked\b/i,
      pattern: /\bbaked\b/i,
    },
    {
      labelPattern: /\bboiled\b/i,
      pattern: /\bboiled\b/i,
    },
    {
      labelPattern: /\bsteamed\b/i,
      pattern: /\bsteamed\b/i,
    },
    // skin / bone
    {
      labelPattern: /\bskinless\b/i,
      pattern: /\bskinless\b/i,
    },
    {
      labelPattern: /\b(with skin|skin[- ]on)\b/i,
      pattern: /\bwith skin\b/i,
    },
    // sugar-related
    {
      labelPattern: /\b(no added sugar|unsweetened)\b/i,
      pattern: /\b(no added sugar|unsweetened)\b/i,
    },
    {
      labelPattern: /\b(sugar[- ]free|diet|zero)\b/i,
      pattern: /\b(sugar[- ]free|diet|zero)\b/i,
    },
  ];

  const lowerText = text.toLowerCase();
  const userMentionedSeeds = /\bseed(s)?\b/i.test(lowerText);

  const breadStylePattern =
    /\b(brown|whole meal|wholemeal|whole[- ]wheat|wholegrain|whole grain|granary)\b/i;
  const isBreadStyleQuery =
    /\bbread\b/i.test(lowerText) && breadStylePattern.test(lowerText);

  if (isBreadStyleQuery) {
    const breadMatches = pool.filter((h) => {
      const label = h.food.label.toLowerCase();
      return (
        breadStylePattern.test(label) &&
        /\bbread\b/i.test(label) &&
        !/\b(canned|boston|crust|crumb|crumbs|crouton|croutons)\b/i.test(label)
      );
    });

    const exactBreadMatch = breadMatches.find(
      (h) => normalizeText(h.food.label) === normalizeText(lowerText),
    );
    if (exactBreadMatch) return exactBreadMatch;

    if (breadMatches.length) return breadMatches[0];
  }

  for (const rule of rules) {
    /**If the query text does not match the rule’s pattern, skip that rule.
      If it does match, filter the returned hints to those whose food.label matches labelPattern. */
    if (!rule.pattern.test(lowerText)) continue;

    // All hints whose labels match this rule
    const matches = pool.filter((h) => rule.labelPattern.test(h.food.label));

    if (!matches.length) continue;

    let hit: EdamamHint | null = null;

    if (!userMentionedSeeds) {
      // Prefer non-seed matches when the user didn't say "seeds"
      const nonSeedMatches = matches.filter(
        (h) => !/\b(seed|pepita)s?\b/i.test(h.food.label),
      );
      if (nonSeedMatches.length) {
        // great, we found a non-seed roasted option
        hit = nonSeedMatches[0];
      } else {
        // all matches are seeds; don't force a seed via this phrase rule
        // let the rest of the logic (or the generic fallback) decide
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

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[^\w\s-]/g, " ").replace(/\s+/g, " ").trim();
}
