
import { foodLogs, dailyRecords, customFoodLogs, menuIngredients, mealCriteria, boxCustomizations, type FoodLog, type DailyRecord, type CustomFoodLog, type MenuIngredient, type MealCriteria, type BoxCustomization, BOX_DATA, calculateHero13 } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, between } from "drizzle-orm";

export interface IStorage {
  getLogs(date: string): Promise<FoodLog[]>;
  createLog(boxId: number, grams: number, date: string, meal?: string): Promise<FoodLog>;
  deleteLog(id: number): Promise<void>;
  resetLogs(date: string): Promise<void>;
  resetBoxLogs(boxId: number, date: string): Promise<void>;
  getDailyRecord(date: string): Promise<DailyRecord | undefined>;
  saveDay(date: string, logs: any[], weightG: number | null, activeMeal: string, points?: number): Promise<void>;
  getRangeData(start: string, end: string): Promise<any[]>;
  getLastWeight(): Promise<number | null>;
  getPoints(date: string): Promise<number>;
  getCustomLogs(date: string): Promise<CustomFoodLog[]>;
  createCustomLog(data: { foodName: string; grams: number; calories: number; protein: number; fiber: number; fat: number; gl: number; meal: string; date: string }): Promise<CustomFoodLog>;
  deleteCustomLog(id: number): Promise<void>;
  resetCustomLogs(date: string): Promise<void>;
  getMenuIngredients(meal: string): Promise<MenuIngredient[]>;
  addMenuIngredient(meal: string, name: string): Promise<MenuIngredient>;
  deleteMenuIngredient(id: number): Promise<void>;
  getMealCriteria(meal: string): Promise<MealCriteria | undefined>;
  upsertMealCriteria(meal: string, data: { calories: number; protein: number; fiber: number; fat: number; gl: number }): Promise<MealCriteria>;
  getBoxCustomizations(): Promise<BoxCustomization[]>;
  getBoxCustomization(boxId: number): Promise<BoxCustomization | undefined>;
  upsertBoxCustomization(data: Partial<BoxCustomization> & { boxId: number }): Promise<BoxCustomization>;
  deleteBoxCustomization(boxId: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getLogs(date: string): Promise<FoodLog[]> {
    return await db.select().from(foodLogs).where(eq(foodLogs.date, date));
  }

  async createLog(boxId: number, grams: number, date: string, meal: string = 'breakfast'): Promise<FoodLog> {
    const [log] = await db.insert(foodLogs).values({ boxId, grams, date, meal }).returning();
    return log;
  }

  async deleteLog(id: number): Promise<void> {
    await db.delete(foodLogs).where(eq(foodLogs.id, id));
  }

  async resetLogs(date: string): Promise<void> {
    await db.delete(foodLogs).where(eq(foodLogs.date, date));
  }

  async resetBoxLogs(boxId: number, date: string): Promise<void> {
    await db.delete(foodLogs).where(and(eq(foodLogs.boxId, boxId), eq(foodLogs.date, date)));
  }

  async getDailyRecord(date: string): Promise<DailyRecord | undefined> {
    const [record] = await db.select().from(dailyRecords).where(eq(dailyRecords.date, date));
    return record;
  }

  async saveDay(date: string, logs: any[], weightG: number | null, activeMeal: string, points: number = 0): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(foodLogs).where(eq(foodLogs.date, date));

      if (logs.length > 0) {
        await tx.insert(foodLogs).values(logs.map(l => ({
          ...l,
          date,
        })));
      }

      await tx.insert(dailyRecords)
        .values({
          date,
          weightG,
          activeMeal,
          savedAtIso: new Date(),
          version: 2,
          points,
        })
        .onConflictDoUpdate({
          target: dailyRecords.date,
          set: {
            weightG,
            activeMeal,
            savedAtIso: new Date(),
            points,
          }
        });
    });
  }

  async getRangeData(start: string, end: string): Promise<any[]> {
    const records = await db.select().from(dailyRecords).where(between(dailyRecords.date, start, end)).orderBy(dailyRecords.date);
    const logs = await db.select().from(foodLogs).where(between(foodLogs.date, start, end));
    const cLogs = await db.select().from(customFoodLogs).where(between(customFoodLogs.date, start, end));

    return records.map(record => {
      const dayLogs = logs.filter(l => l.date === record.date);
      const dayCustom = cLogs.filter(l => l.date === record.date);
      let totalCals = 0;
      let totalP = 0;
      let totalF = 0;
      let totalFat = 0;
      let totalGl = 0;
      let totalWeight = 0;

      dayLogs.forEach(l => {
        const box = BOX_DATA[l.boxId];
        if (box) {
          const factor = l.grams / 100;
          totalCals += box.macros.calories * factor;
          totalP += box.macros.protein * factor;
          totalF += box.macros.fiber * factor;
          totalFat += box.macros.fat * factor;
          totalGl += box.macros.gl * factor;
          totalWeight += l.grams;
        }
      });

      dayCustom.forEach(cl => {
        totalCals += cl.calories;
        totalP += cl.protein;
        totalF += cl.fiber;
        totalFat += cl.fat;
        totalGl += cl.gl;
        totalWeight += cl.grams;
      });

      return {
        date: record.date,
        weightG: record.weightG,
        calories: Math.round(totalCals),
        hero13: calculateHero13(totalP, totalF, totalFat, totalCals, totalGl, totalWeight || 1)
      };
    });
  }

  async getLastWeight(): Promise<number | null> {
    const [record] = await db.select().from(dailyRecords).orderBy(desc(dailyRecords.date)).limit(1);
    return record?.weightG || null;
  }

  async getPoints(date: string): Promise<number> {
    const [record] = await db.select({ points: dailyRecords.points }).from(dailyRecords).where(eq(dailyRecords.date, date));
    return record?.points ?? 0;
  }

  async getCustomLogs(date: string): Promise<CustomFoodLog[]> {
    return await db.select().from(customFoodLogs).where(eq(customFoodLogs.date, date));
  }

  async createCustomLog(data: { foodName: string; grams: number; calories: number; protein: number; fiber: number; fat: number; gl: number; meal: string; date: string }): Promise<CustomFoodLog> {
    const [log] = await db.insert(customFoodLogs).values(data).returning();
    return log;
  }

  async deleteCustomLog(id: number): Promise<void> {
    await db.delete(customFoodLogs).where(eq(customFoodLogs.id, id));
  }

  async resetCustomLogs(date: string): Promise<void> {
    await db.delete(customFoodLogs).where(eq(customFoodLogs.date, date));
  }

  async getMenuIngredients(meal: string): Promise<MenuIngredient[]> {
    return await db.select().from(menuIngredients).where(eq(menuIngredients.meal, meal)).orderBy(menuIngredients.createdAt);
  }

  async addMenuIngredient(meal: string, name: string): Promise<MenuIngredient> {
    const [ing] = await db.insert(menuIngredients).values({ meal, name }).returning();
    return ing;
  }

  async deleteMenuIngredient(id: number): Promise<void> {
    await db.delete(menuIngredients).where(eq(menuIngredients.id, id));
  }

  async getMealCriteria(meal: string): Promise<MealCriteria | undefined> {
    const [row] = await db.select().from(mealCriteria).where(eq(mealCriteria.meal, meal));
    return row;
  }

  async upsertMealCriteria(meal: string, data: { calories: number; protein: number; fiber: number; fat: number; gl: number }): Promise<MealCriteria> {
    const [row] = await db.insert(mealCriteria).values({ meal, ...data })
      .onConflictDoUpdate({ target: mealCriteria.meal, set: data })
      .returning();
    return row;
  }

  async getBoxCustomizations(): Promise<BoxCustomization[]> {
    return await db.select().from(boxCustomizations);
  }

  async getBoxCustomization(boxId: number): Promise<BoxCustomization | undefined> {
    const [row] = await db.select().from(boxCustomizations).where(eq(boxCustomizations.boxId, boxId));
    return row;
  }

  async upsertBoxCustomization(data: Partial<BoxCustomization> & { boxId: number }): Promise<BoxCustomization> {
    const { boxId, ...rest } = data;
    const [row] = await db.insert(boxCustomizations)
      .values({ boxId, ...rest } as any)
      .onConflictDoUpdate({ target: boxCustomizations.boxId, set: rest as any })
      .returning();
    return row;
  }

  async deleteBoxCustomization(boxId: number): Promise<void> {
    await db.delete(boxCustomizations).where(eq(boxCustomizations.boxId, boxId));
  }
}

export const storage = new DatabaseStorage();
