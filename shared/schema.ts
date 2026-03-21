
import { pgTable, text, serial, integer, timestamp, date, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const foodLogs = pgTable("food_logs", {
  id: serial("id").primaryKey(),
  boxId: integer("box_id").notNull(),
  grams: integer("grams").notNull(),
  meal: text("meal").notNull().default('breakfast'), // breakfast, lunch, snack, dinner
  date: date("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyRecords = pgTable("daily_records", {
  date: date("date").primaryKey(),
  weightG: integer("weight_g"),
  activeMeal: text("active_meal").notNull().default('breakfast'),
  savedAtIso: timestamp("saved_at_iso").defaultNow(),
  version: integer("version").notNull().default(2),
  points: integer("points").notNull().default(0),
});

export const customFoodLogs = pgTable("custom_food_logs", {
  id: serial("id").primaryKey(),
  foodName: text("food_name").notNull(),
  grams: integer("grams").notNull(),
  calories: integer("calories").notNull(),
  protein: integer("protein").notNull(),
  fiber: integer("fiber").notNull(),
  fat: integer("fat").notNull(),
  gl: integer("gl").notNull(),
  meal: text("meal").notNull().default('breakfast'),
  date: date("date").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFoodLogSchema = createInsertSchema(foodLogs).omit({ 
  id: true, 
  createdAt: true,
  date: true 
});

export const insertCustomFoodLogSchema = createInsertSchema(customFoodLogs).omit({
  id: true,
  createdAt: true,
  date: true,
});

export const insertDailyRecordSchema = createInsertSchema(dailyRecords);

export type CustomFoodLog = typeof customFoodLogs.$inferSelect;

export type FoodLog = typeof foodLogs.$inferSelect;
export type DailyRecord = typeof dailyRecords.$inferSelect;

export type MealType = "breakfast" | "lunch" | "snack" | "dinner";

export const MEAL_TARGETS: Record<MealType, { calories: number; protein: number; fiber: number; weight: number }> = {
  breakfast: { calories: 300, protein: 30, fiber: 8, weight: 400 },
  lunch: { calories: 550, protein: 40, fiber: 10, weight: 700 },
  snack: { calories: 200, protein: 20, fiber: 5, weight: 300 },
  dinner: { calories: 500, protein: 50, fiber: 7, weight: 500 },
};

// Utilities for Hero13 and Satiety Score
const clip = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const clampInt = (x: number, a: number, b: number) => Math.max(a, Math.min(b, Math.round(x)));

export function calculateHero13(p: number, f: number, fat: number, c: number, gl: number, w: number): number {
  if (c <= 0 || w <= 0) return 0;
  const PROTEIN_CAP_G = 150.0;
  const FIBER_CAP_G = 30.0;
  const FAT_CAP_G = 30.0;
  const PROTEIN_WEIGHT = 500.0;
  const FIBER_WEIGHT = 300.0;
  const FAT_WEIGHT = 50.0;
  const NUMERATOR_SCALE = 0.60;
  const GL_THRESHOLD = 50.0;
  const GL_K = 60.0;
  const ED_REF = 2.0;
  const VOLUME_ALPHA = 0.80;
  const cCorr = c + 2.0 * f;
  const proteinCap = Math.min(p / PROTEIN_CAP_G, 1.0);
  const fiberCap = Math.min(f / FIBER_CAP_G, 1.0);
  const fatCap = Math.min(fat / FAT_CAP_G, 1.0);
  const numerator = ((proteinCap * PROTEIN_WEIGHT) / cCorr + (fiberCap * FIBER_WEIGHT) / cCorr + (fatCap * FAT_WEIGHT) / cCorr) * NUMERATOR_SCALE;
  const x = Math.max(0.0, gl - GL_THRESHOLD) / GL_K;
  const glDenom = 1.0 + x * x;
  const ed = cCorr / w;
  const vTerm = clip(ED_REF / ed - 1.0, 0.0, 1.0);
  const vBonus = 1.0 + VOLUME_ALPHA * vTerm;
  const heroRaw = (numerator / glDenom) * vBonus;
  return clampInt(100.0 * heroRaw, 0, 100);
}

export function calculateSatietyScore(c: number, w: number, p: number, f: number): number {
  if (c <= 0 || w <= 0) return 0;
  const ed = c / w;
  const v = clip(2.0 / ed - 1.0, 0.0, 1.0);
  const pt = clip(p / 35.0, 0.0, 1.0);
  const ft = clip(f / 10.0, 0.0, 1.0);
  return 100.0 * (0.45 * v + 0.35 * pt + 0.20 * ft);
}

// Box Definition Type (Shared for frontend/backend calculations)
export interface BoxDefinition {
  id: number;
  name: string;
  group: 'matrix' | 'buttons';
  macros: {
    calories: number;
    protein: number;
    fiber: number;
    fat: number;
    gl: number;
  };
  increment: number;
  examples: string[];
  hero13: number;
  satietyPer100kcal: number;
}

const createBox = (id: number, name: string, group: 'matrix' | 'buttons', macros: BoxDefinition['macros'], increment: number, examples: string[]): BoxDefinition => {
  const C = macros.calories;
  let satPer100kcal = 0;
  if (C > 0) {
    const factor = 100 / C;
    satPer100kcal = calculateSatietyScore(100, 100 * factor, macros.protein * factor, macros.fiber * factor);
  }
  return {
    id, name, group, macros, increment, examples,
    hero13: calculateHero13(macros.protein, macros.fiber, macros.fat, macros.calories, macros.gl, 100),
    satietyPer100kcal: Math.round(satPer100kcal * 10) / 10,
  };
};

export const CAL_THRESHOLD: Record<number, number> = {
  1: 1511, 2: 1430, 3: 1150, 4: 1460, 5: 1370, 6: 1350,
  7: 1504, 8: 1420, 9: 1200, 10: 950, 11: 1400, 12: 1290,
  13: 1526, 14: 1170, 15: 1500, 16: 1463, 17: 1491,
};

export const GL_THRESHOLD: Record<number, number> = {
  1: 1000, 2: 60, 3: 1000, 4: 1000, 5: 1000, 6: 1000,
  7: 65, 8: 55, 9: 48, 10: 1000, 11: 1000, 12: 33,
  13: 1000, 14: 1000, 15: 1000, 16: 56, 17: 69,
};

export const BOX_DATA: Record<number, BoxDefinition> = {
  1: createBox(1, "Vegetables", 'matrix', { calories: 39, protein: 2, fiber: 2.7, fat: 0, gl: 1 }, 50, ["broccoli", "zucchini", "tomatoes", "eggplant", "fennel"]),
  2: createBox(2, "Legumes", 'matrix', { calories: 120, protein: 9, fiber: 7, fat: 1, gl: 10 }, 50, ["lentils", "chickpeas", "cannellini beans", "borlotti beans", "mixed beans"]),
  3: createBox(3, "Cheese + Salami", 'matrix', { calories: 400, protein: 28, fiber: 0, fat: 30, gl: 0 }, 50, ["parmigiano reggiano", "grana padano", "pecorino", "salami", "prosciutto crudo"]),
  4: createBox(4, "Lean Protein", 'matrix', { calories: 90, protein: 20, fiber: 0, fat: 0, gl: 0 }, 50, ["egg whites", "cod", "tuna", "shrimp", "turkey breast"]),
  5: createBox(5, "Protein Staples", 'matrix', { calories: 180, protein: 22, fiber: 0, fat: 0, gl: 0 }, 50, ["whole eggs", "greek yogurt", "skyr", "cottage cheese", "low-fat yogurt"]),
  6: createBox(6, "Meat + Salmon", 'matrix', { calories: 200, protein: 25, fiber: 0, fat: 15, gl: 0 }, 50, ["salmon", "beef steak", "chicken thighs", "pork", "bavette steak"]),
  7: createBox(7, "Fruits", 'matrix', { calories: 46, protein: 0.7, fiber: 1.8, fat: 0, gl: 5 }, 50, ["papaya", "raspberries", "mixed berries", "orange", "apple"]),
  8: createBox(8, "Starchy Foods", 'matrix', { calories: 130, protein: 3, fiber: 1, fat: 0, gl: 15 }, 50, ["pasta", "risotto", "polenta", "gnocchi", "couscous"]),
  9: createBox(9, "Refined Carbs", 'matrix', { calories: 350, protein: 5, fiber: 0, fat: 15, gl: 22 }, 50, ["pizza", "lasagna", "croissant", "cakes", "biscuits"]),
  10: createBox(10, "Nuts", 'buttons', { calories: 600, protein: 17, fiber: 12, fat: 55, gl: 1 }, 10, ["almonds", "hazelnuts", "pistachios", "walnuts"]),
  11: createBox(11, "Oil", 'buttons', { calories: 884, protein: 0, fiber: 0, fat: 100, gl: 0 }, 10, ["olive oil"]),
  12: createBox(12, "Bread", 'buttons', { calories: 260, protein: 8, fiber: 2.7, fat: 3, gl: 37 }, 50, ["white bread", "typical bread"]),
  13: createBox(13, "Fiber Powder", 'buttons', { calories: 24, protein: 0, fiber: 98, fat: 0, gl: 0 }, 5, []),
  14: createBox(14, "Protein Powder", 'buttons', { calories: 380, protein: 80, fiber: 3, fat: 0, gl: 0 }, 10, []),
  15: createBox(15, "Berries", 'buttons', { calories: 50, protein: 1, fiber: 6.5, fat: 1, gl: 1 }, 10, ["raspberries", "blackberries", "strawberries (average)"]),
  16: createBox(16, "Boiled Potatoes", 'buttons', { calories: 87, protein: 2, fiber: 2, fat: 0, gl: 14 }, 50, ["boiled potatoes (plain)"]),
  17: createBox(17, "Greek Y", 'buttons', { calories: 59, protein: 10, fiber: 0, fat: 0, gl: 1 }, 50, ["Greek yogurt (plain, low-fat)"]),
  18: createBox(18, "Oats", 'buttons', { calories: 389, protein: 17, fiber: 10, fat: 7, gl: 32 }, 40, ["rolled oats", "oat porridge", "overnight oats", "oat bran"])
};

export const SIDEBAR_ORDER = [17, 18, 10, 11, 12, 13, 14, 15, 16];
