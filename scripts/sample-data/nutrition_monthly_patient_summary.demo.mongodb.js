const COLLECTION = "nutrition_monthly_patient_summary";

const TARGET_SNAPSHOT = {
  caloriesKcal: 1800,
  phosphorusMg: 550,
  potassiumMg: 2200,
  proteinG: 70,
  sodiumMg: 2000,
};

const MONTHS = [
  {
    month: "2026-04",
    daysLogged: 17,
    multiplier: 0.92,
  },
  {
    month: "2026-05",
    daysLogged: 21,
    multiplier: 1,
  },
  {
    month: "2026-06",
    daysLogged: 13,
    multiplier: 1.08,
  },
];

const PATIENTS = [
  {
    patientId: "000000000000000000000001",
    foods: {
      caloriesKcal: [
        "Porridge oats",
        "Peanut butter toast",
        "Chicken wrap",
        "Rice bowl",
        "Pasta bake",
        "Yogurt parfait",
      ],
      phosphorusMg: [
        "Chicken curry",
        "Wholemeal bread",
        "Cheddar cheese",
        "Porridge oats",
        "Baked beans",
        "Greek yogurt",
      ],
      potassiumMg: [
        "Banana",
        "Tomato pasta",
        "Avocado toast",
        "Potato curry",
        "Spinach dhal",
        "Orange juice",
      ],
      proteinG: [
        "Greek yogurt",
        "Chicken wrap",
        "Egg omelette",
        "Tuna sandwich",
        "Lentil soup",
        "Cottage cheese",
      ],
      sodiumMg: [
        "Tomato soup",
        "Cheese sandwich",
        "Ready meal pasta",
        "Crackers",
        "Soy sauce noodles",
        "Salted popcorn",
      ],
    },
    monthly: {
      caloriesKcal: 1835,
      phosphorusMg: 612,
      potassiumMg: 2010,
      proteinG: 76,
      sodiumMg: 1890,
    },
  },
  {
    patientId: "000000000000000000000002",
    foods: {
      caloriesKcal: [
        "Toast with peanut butter",
        "Granola pot",
        "Cheese toastie",
        "Chicken pie",
        "Rice pudding",
        "Fruit smoothie",
      ],
      phosphorusMg: [
        "Cheese sandwich",
        "Wholemeal toast",
        "Chicken pie",
        "Baked beans",
        "Granola pot",
        "Rice pudding",
      ],
      potassiumMg: [
        "Orange juice",
        "Banana loaf",
        "Tomato soup",
        "Potato wedges",
        "Spinach pasta",
        "Vegetable curry",
      ],
      proteinG: [
        "Egg omelette",
        "Chicken pie",
        "Ham sandwich",
        "Greek yogurt",
        "Beans on toast",
        "Milkshake",
      ],
      sodiumMg: [
        "Tinned soup",
        "Ham sandwich",
        "Crisps",
        "Cheese toastie",
        "Instant noodles",
        "Ready meal curry",
      ],
    },
    monthly: {
      caloriesKcal: 1720,
      phosphorusMg: 565,
      potassiumMg: 1875,
      proteinG: 68,
      sodiumMg: 1760,
    },
  },
  {
    patientId: "000000000000000000000003",
    foods: {
      caloriesKcal: [
        "Granola with milk",
        "Chicken salad wrap",
        "Hummus pita",
        "Berry smoothie",
        "Pasta salad",
        "Overnight oats",
      ],
      phosphorusMg: [
        "Lentil dhal",
        "Granola with milk",
        "Hummus pita",
        "Wholegrain crackers",
        "Chicken salad",
        "Yogurt pot",
      ],
      potassiumMg: [
        "Avocado wrap",
        "Spinach dhal",
        "Tomato pasta",
        "Banana smoothie",
        "Roast potatoes",
        "Vegetable soup",
      ],
      proteinG: [
        "Chicken salad",
        "Greek yogurt",
        "Lentil dhal",
        "Boiled eggs",
        "Tuna pasta",
        "Cottage cheese",
      ],
      sodiumMg: [
        "Soy sauce noodles",
        "Hummus pita",
        "Crackers",
        "Soup carton",
        "Cheese wrap",
        "Salted nuts",
      ],
    },
    monthly: {
      caloriesKcal: 1645,
      phosphorusMg: 498,
      potassiumMg: 1730,
      proteinG: 64,
      sodiumMg: 1585,
    },
  },
  {
    patientId: "000000000000000000000004",
    foods: {
      caloriesKcal: [
        "Rice and fish",
        "Tuna pasta",
        "Chicken biryani",
        "Toast with butter",
        "Custard pot",
        "Porridge oats",
      ],
      phosphorusMg: [
        "Wholemeal bread",
        "Tuna pasta",
        "Chicken biryani",
        "Cheese omelette",
        "Porridge oats",
        "Baked beans",
      ],
      potassiumMg: [
        "Potato curry",
        "Tomato rice",
        "Banana",
        "Spinach stew",
        "Vegetable soup",
        "Orange juice",
      ],
      proteinG: [
        "Tuna pasta",
        "Chicken biryani",
        "Greek yogurt",
        "Egg sandwich",
        "Fish pie",
        "Beans on toast",
      ],
      sodiumMg: [
        "Ready meal pasta",
        "Instant noodles",
        "Soup carton",
        "Cheese crackers",
        "Salted crisps",
        "Soy sauce rice",
      ],
    },
    monthly: {
      caloriesKcal: 1910,
      phosphorusMg: 688,
      potassiumMg: 2265,
      proteinG: 81,
      sodiumMg: 2145,
    },
  },
  {
    patientId: "000000000000000000000005",
    foods: {
      caloriesKcal: [
        "Overnight oats",
        "Rice bowl",
        "Grilled salmon",
        "Fruit yogurt",
        "Chicken wrap",
        "Granola bar",
      ],
      phosphorusMg: [
        "Rice bowl",
        "Wholemeal pitta",
        "Greek yogurt",
        "Salmon fillet",
        "Lentil curry",
        "Oat biscuits",
      ],
      potassiumMg: [
        "Spinach curry",
        "Tomato rice",
        "Banana",
        "Potato mash",
        "Vegetable stew",
        "Orange segments",
      ],
      proteinG: [
        "Grilled salmon",
        "Greek yogurt",
        "Chicken wrap",
        "Egg salad",
        "Lentil curry",
        "Cottage cheese",
      ],
      sodiumMg: [
        "Crackers and dip",
        "Soup carton",
        "Cheese wrap",
        "Ready meal noodles",
        "Soy sauce rice",
        "Salted pretzels",
      ],
    },
    monthly: {
      caloriesKcal: 1765,
      phosphorusMg: 542,
      potassiumMg: 1945,
      proteinG: 72,
      sodiumMg: 1680,
    },
  },
];

function round(value) {
  return Math.round(value * 10) / 10;
}

function metricTotal(dailyAverage, daysLogged) {
  return round(dailyAverage * daysLogged);
}

function buildTopFood(
  food,
  dailyAverage,
  daysLogged,
  previousMultiplier,
  currentMultiplier,
  rank,
) {
  const weight = [0.3, 0.24, 0.19, 0.15, 0.11, 0.08][rank] ?? 0.05;
  const timesWeight = [0.56, 0.46, 0.4, 0.34, 0.29, 0.24][rank] ?? 0.2;
  const timesLogged = Math.max(4, Math.round(daysLogged * timesWeight));
  const averageAmount = round(dailyAverage * weight);
  const totalAmount = metricTotal(averageAmount, timesLogged);
  const previousMonthAmount = round(totalAmount * (previousMultiplier / currentMultiplier));

  let levelLabel = "Medium";
  if (averageAmount >= dailyAverage * 0.38) {
    levelLabel = "High";
  } else if (averageAmount >= dailyAverage * 0.28) {
    levelLabel = "Medium-high";
  }

  let trend = "same";
  if (totalAmount >= previousMonthAmount * 1.1) {
    trend = "increased";
  } else if (totalAmount <= previousMonthAmount * 0.9) {
    trend = "reduced";
  }

  return {
    averageAmount,
    food,
    levelLabel,
    previousMonthAmount,
    timesLogged,
    totalAmount,
    trend,
  };
}

const docs = PATIENTS.flatMap((patient) =>
  MONTHS.map((monthConfig, monthIndex) => {
    const generatedAt = ISODate(`${monthConfig.month}-28T12:00:00.000Z`);
    const previousMultiplier =
      MONTHS[Math.max(0, monthIndex - 1)].multiplier;

    const dailyAverages = Object.fromEntries(
      Object.entries(patient.monthly).map(([metric, baseValue]) => [
        metric,
        round(baseValue * monthConfig.multiplier),
      ]),
    );

    const totals = Object.fromEntries(
      Object.entries(dailyAverages).map(([metric, dailyAverage]) => [
        metric,
        metricTotal(dailyAverage, monthConfig.daysLogged),
      ]),
    );

    const topFoods = Object.fromEntries(
      Object.entries(patient.foods).map(([metric, foods]) => [
        metric,
        foods.map((food, rank) =>
          buildTopFood(
            food,
            dailyAverages[metric],
            monthConfig.daysLogged,
            previousMultiplier,
            monthConfig.multiplier,
            rank,
          ),
        ),
      ]),
    );

    return {
      createdAt: generatedAt,
      dailyAverages,
      daysLogged: monthConfig.daysLogged,
      generatedAt,
      month: monthConfig.month,
      patientId: ObjectId(patient.patientId),
      sourceVersion: 1,
      targetSnapshot: TARGET_SNAPSHOT,
      topFoods,
      totals,
      updatedAt: generatedAt,
    };
  }),
);

db.getCollection(COLLECTION).deleteMany({
  patientId: {
    $in: PATIENTS.map((patient) => ObjectId(patient.patientId)),
  },
  month: {
    $in: MONTHS.map((month) => month.month),
  },
});

db.getCollection(COLLECTION).insertMany(docs);
