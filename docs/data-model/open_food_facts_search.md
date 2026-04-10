# Open Food Facts Search Response

This document describes the Open Food Facts search payload used by `ckd-copilot`.

It is not the complete Open Food Facts product schema. The app requests a narrowed set of fields in `apps/api/lib/nutrition/searchOpenFoodFacts.ts`, then maps each product into the app's internal `TFoodSearchCandidate` shape.

## Request made to OFF

The API call is:

```text
GET /cgi/search.pl
```

With these query params:

```text
action=process
app_name=<OPEN_FOOD_FACTS_APP_NAME or ckd-copilot>
fields=brands,brands_tags,categories,categories_tags,code,countries,countries_tags,data_quality_errors_tags,image_front_small_url,nutriments,product_name,product_name_en,quantity,serving_size
json=1
page_size=20
search_simple=1
search_terms=<query>
```

## Raw OFF payload used by this app

At runtime this code only assumes:

```ts
type OpenFoodFactsSearchPayload = {
  products?: OpenFoodFactsProduct[];
};

type OpenFoodFactsProduct = {
  brands?: string;
  brands_tags?: string[];
  categories?: string;
  categories_tags?: string[];
  code?: string;
  countries?: string;
  countries_tags?: string[];
  data_quality_errors_tags?: string[];
  image_front_small_url?: string;
  nutriments?: {
    "energy-kcal_100g"?: number;
    energy_kcal_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    phosphorus_100g?: number;
    potassium_100g?: number;
    proteins_100g?: number;
    sodium_100g?: number;
    [key: string]: unknown;
  };
  product_name?: string;
  product_name_en?: string;
  quantity?: string;
  serving_size?: string;
  [key: string]: unknown;
};
```

## Example raw OFF product object

This is the effective shape the integration expects from each product:

```json
{
  "brands": "Tesco",
  "brands_tags": ["tesco"],
  "categories": "Meals, Ready meals",
  "categories_tags": ["en:meals", "en:ready-meals"],
  "code": "5059697066051",
  "countries": "United Kingdom",
  "countries_tags": ["en:united-kingdom"],
  "data_quality_errors_tags": [],
  "image_front_small_url": "https://images.openfoodfacts.org/images/products/505/969/706/6051/front_en.3.200.jpg",
  "nutriments": {
    "energy-kcal_100g": 126,
    "carbohydrates_100g": 9.4,
    "fat_100g": 5.2,
    "fiber_100g": 1.8,
    "phosphorus_100g": 120,
    "potassium_100g": 310,
    "proteins_100g": 7.1,
    "sodium_100g": 0.42
  },
  "product_name": "Chicken Dinner",
  "product_name_en": "Chicken Dinner",
  "quantity": "400 g",
  "serving_size": "200 g"
}
```

## Internal object returned by `searchOpenFoodFacts()`

The raw OFF product is converted into:

```ts
type TFoodSearchCandidate = {
  provider: "open_food_facts";
  food: {
    foodId: string;
    label: string;
    knownAs?: string;
    brand?: string;
    category?: string;
    categoryLabel?: string;
    image?: string;
    nutrients: {
      caloriesKcal?: number;
      carbsG?: number;
      fatG?: number;
      fiberG?: number;
      phosphorusMg?: number;
      potassiumMg?: number;
      proteinG?: number;
      sodiumMg?: number;
    };
  };
  measures: [];
  metadata?: {
    barcode?: string;
    imageUrl?: string;
    servingSize?: string;
    ukMarketMatch?: boolean;
  };
};
```

## Example normalized return object

```json
{
  "provider": "open_food_facts",
  "food": {
    "foodId": "5059697066051",
    "label": "Chicken Dinner",
    "knownAs": "Chicken Dinner",
    "brand": "Tesco",
    "category": "packaged-foods",
    "categoryLabel": "food",
    "image": "https://images.openfoodfacts.org/images/products/505/969/706/6051/front_en.3.200.jpg",
    "nutrients": {
      "caloriesKcal": 126,
      "carbsG": 9.4,
      "fatG": 5.2,
      "fiberG": 1.8,
      "phosphorusMg": 120,
      "potassiumMg": 310,
      "proteinG": 7.1,
      "sodiumMg": 420
    }
  },
  "measures": [],
  "metadata": {
    "barcode": "5059697066051",
    "imageUrl": "https://images.openfoodfacts.org/images/products/505/969/706/6051/front_en.3.200.jpg",
    "servingSize": "200 g",
    "ukMarketMatch": true
  }
}
```

## Field mapping

| OFF field | Internal field | Notes |
| --- | --- | --- |
| `product_name_en` or `product_name` | `food.label`, `food.knownAs` | `product_name_en` is preferred. |
| `brands` | `food.brand` | First comma-separated brand only. |
| `code` | `food.foodId`, `metadata.barcode` | Falls back to normalized `<brand> <product name>` if missing. |
| `image_front_small_url` | `food.image`, `metadata.imageUrl` | Passed through as-is. |
| `serving_size` | `metadata.servingSize` | Passed through as-is. |
| `countries` / `countries_tags` / `brands` | `metadata.ukMarketMatch` | Derived heuristic for UK relevance. |
| `nutriments.energy-kcal_100g` | `food.nutrients.caloriesKcal` | Also accepts `energy_kcal_100g`. |
| `nutriments.carbohydrates_100g` | `food.nutrients.carbsG` | Per 100g. |
| `nutriments.fat_100g` | `food.nutrients.fatG` | Per 100g. |
| `nutriments.fiber_100g` | `food.nutrients.fiberG` | Per 100g. |
| `nutriments.phosphorus_100g` | `food.nutrients.phosphorusMg` | Per 100g. |
| `nutriments.potassium_100g` | `food.nutrients.potassiumMg` | Per 100g. |
| `nutriments.proteins_100g` | `food.nutrients.proteinG` | Per 100g. |
| `nutriments.sodium_100g` | `food.nutrients.sodiumMg` | Converted from grams to milligrams. |

## Important limitation

If you mean the full OFF object returned by the public API, this repo does not currently request or model that entire schema. It only requests the fields listed above, and everything else is ignored by the mapper.

## Fuller raw OFF example

Below is a broader example of a raw OFF product object shape for an English-language item, based on OFF's documented product format. This is still only a representative excerpt because the full object is very large.

Source references:

- OFF full JSON example: https://test-wiki.openfoodfacts.org/API/Full_JSON_example
- OFF API fields reference: https://wiki.openfoodfacts.org/wiki/API_Fields

```json
{
  "product": {
    "_id": "5000112548167",
    "id": "5000112548167",
    "code": "5000112548167",
    "lang": "en",
    "product_name": "Baked Beans in Tomato Sauce",
    "product_name_en": "Baked Beans in Tomato Sauce",
    "generic_name_en": "Beans in tomato sauce",
    "quantity": "415 g",
    "brands": "Heinz",
    "stores": "Tesco, Sainsbury's",
    "categories": "Plant-based foods and beverages, Plant-based foods, Legumes and their products, Meals, Canned foods, Baked beans",
    "categories_tags": [
      "en:plant-based-foods-and-beverages",
      "en:plant-based-foods",
      "en:legumes-and-their-products",
      "en:meals",
      "en:canned-foods",
      "en:baked-beans"
    ],
    "countries": "United Kingdom",
    "countries_tags": ["en:united-kingdom"],
    "ingredients_text": "Beans (51%), tomatoes (34%), water, sugar, spirit vinegar, modified cornflour, salt, spice extracts, herb extract.",
    "ingredients_text_en": "Beans (51%), tomatoes (34%), water, sugar, spirit vinegar, modified cornflour, salt, spice extracts, herb extract.",
    "ingredients_tags": [
      "en:beans",
      "en:tomatoes",
      "en:water",
      "en:sugar",
      "en:spirit-vinegar",
      "en:modified-cornflour",
      "en:salt",
      "en:spice-extracts",
      "en:herb-extract"
    ],
    "ingredients_analysis_tags": [
      "en:palm-oil-free",
      "en:vegan",
      "en:vegetarian"
    ],
    "allergens": "",
    "traces": "",
    "ingredients": [
      {
        "id": "en:beans",
        "text": "Beans",
        "percent": 51,
        "vegan": "yes",
        "vegetarian": "yes"
      },
      {
        "id": "en:tomatoes",
        "text": "tomatoes",
        "percent": 34,
        "vegan": "yes",
        "vegetarian": "yes"
      },
      {
        "id": "en:water",
        "text": "water",
        "vegan": "yes",
        "vegetarian": "yes"
      },
      {
        "id": "en:sugar",
        "text": "sugar",
        "vegan": "yes",
        "vegetarian": "yes"
      },
      {
        "id": "en:modified-cornflour",
        "text": "modified cornflour",
        "vegan": "yes",
        "vegetarian": "yes"
      },
      {
        "id": "en:salt",
        "text": "salt",
        "vegan": "yes",
        "vegetarian": "yes"
      }
    ],
    "pnns_groups_2": "Legumes",
    "nova_groups": 3,
    "nutrient_levels": {
      "salt": "moderate",
      "sugars": "moderate",
      "saturated-fat": "low",
      "fat": "low"
    },
    "nutriments": {
      "energy-kcal_100g": 78,
      "carbohydrates_100g": 12.5,
      "fat_100g": 0.2,
      "fiber_100g": 4.7,
      "proteins_100g": 4.7,
      "salt_100g": 0.6,
      "sodium_100g": 0.24,
      "sugars_100g": 4.7,
      "nova-group": 3,
      "nutrition-score-uk": 2
    },
    "image_front_url": "https://images.openfoodfacts.org/images/products/500/011/254/8167/front_en.10.full.jpg",
    "image_thumb_url": "https://images.openfoodfacts.org/images/products/500/011/254/8167/front_en.10.100.jpg",
    "image_ingredients_thumb_url": "https://images.openfoodfacts.org/images/products/500/011/254/8167/ingredients_en.12.100.jpg",
    "image_nutrition_small_url": "https://images.openfoodfacts.org/images/products/500/011/254/8167/nutrition_en.13.200.jpg",
    "languages_codes": {
      "en": 10
    },
    "states_hierarchy": [
      "en:to-be-checked",
      "en:complete",
      "en:nutrition-facts-completed",
      "en:ingredients-completed",
      "en:categories-completed",
      "en:brands-completed",
      "en:packaging-completed",
      "en:quantity-completed",
      "en:product-name-completed",
      "en:photos-validated",
      "en:photos-uploaded"
    ],
    "additives_tags": [],
    "purchase_places": "London, Manchester",
    "created_t": 1712304000,
    "completed_t": 1712390400,
    "rev": 42
  }
}
```

Compared with the smaller payload used by `ckd-copilot`, the broader OFF object often includes:

- multiple localized names and texts
- processing and nutrition classification fields such as `nova_groups`, `nutrient_levels`, and nutrition scores
- ingredient, additive, allergen, and trace metadata
- image variants and selected image structures
- workflow and provenance metadata such as `states_hierarchy`, `created_t`, and revision fields

If ingredients are your main interest, these raw OFF fields are the important ones:

- `ingredients_text`: ingredient list as a single string
- `ingredients_text_en`: language-specific ingredient list when available
- `ingredients_tags`: normalized ingredient taxonomy tags
- `ingredients`: structured ingredient array, often including `id`, `text`, `percent`, and dietary flags
- `ingredients_analysis_tags`: derived tags such as vegan / vegetarian / palm-oil-free
- `allergens` and `traces`: declared allergen and trace statements
