import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { BOX_DATA, calculateHero13, calculateSatietyScore, type BoxDefinition } from "@shared/schema";

async function searchUSDA(query: string): Promise<any[]> {
  const apiKey = process.env.USDA_API_KEY || 'DEMO_KEY';
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}&query=${encodeURIComponent(query)}&pageSize=8`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.foods || []).slice(0, 5).map((food: any) => {
    const nutrients: Record<string, number> = {};
    (food.foodNutrients || []).forEach((n: any) => {
      nutrients[n.nutrientName] = n.value;
    });
    const name = (food.description || '').toLowerCase().replace(/\b\w/g, (c: string) => c.toUpperCase());
    return {
      name,
      per100g: {
        calories: Math.round(nutrients["Energy"] || 0),
        protein: Math.round(nutrients["Protein"] || 0),
        fiber: Math.round(nutrients["Fiber, total dietary"] || 0),
        fat: Math.round(nutrients["Total lipid (fat)"] || 0),
        carbs: Math.round(nutrients["Carbohydrate, by difference"] || 0),
        gl: Math.round((nutrients["Carbohydrate, by difference"] || 0) * 0.5),
      },
    };
  });
}

function mergeBoxData(customizations: any[]): Record<number, BoxDefinition & { hidden?: boolean; isCustom?: boolean; customized?: boolean }> {
  const result: Record<number, any> = {};

  // Start with static BOX_DATA
  for (const [idStr, box] of Object.entries(BOX_DATA)) {
    result[Number(idStr)] = { ...box, hidden: false, isCustom: false, customized: false };
  }

  // Apply customizations
  for (const c of customizations) {
    if (result[c.boxId]) {
      // Override existing box
      const existing = result[c.boxId];
      const newMacros = {
        calories: c.calories ?? existing.macros.calories,
        protein: c.protein ?? existing.macros.protein,
        fiber: c.fiber ?? existing.macros.fiber,
        fat: c.fat ?? existing.macros.fat,
        gl: c.gl ?? existing.macros.gl,
      };
      result[c.boxId] = {
        ...existing,
        name: c.name ?? existing.name,
        macros: newMacros,
        increment: c.increment ?? existing.increment,
        examples: c.examples ? JSON.parse(c.examples) : existing.examples,
        group: c.group ?? existing.group,
        hidden: c.hidden === 1,
        customized: true,
        hero13: calculateHero13(newMacros.protein, newMacros.fiber, newMacros.fat, newMacros.calories, newMacros.gl, 100),
        satietyPer100kcal: (() => {
          const C = newMacros.calories;
          if (C <= 0) return 0;
          const factor = 100 / C;
          const s = calculateSatietyScore(100, 100 * factor, newMacros.protein * factor, newMacros.fiber * factor);
          return Math.round(s * 10) / 10;
        })(),
      };
    } else if (c.isCustom === 1) {
      // New custom box
      const macros = {
        calories: c.calories ?? 100,
        protein: c.protein ?? 0,
        fiber: c.fiber ?? 0,
        fat: c.fat ?? 0,
        gl: c.gl ?? 0,
      };
      const examples = c.examples ? JSON.parse(c.examples) : [];
      result[c.boxId] = {
        id: c.boxId,
        name: c.name ?? 'Custom Food',
        group: c.group ?? 'buttons',
        macros,
        increment: c.increment ?? 10,
        examples,
        hidden: c.hidden === 1,
        isCustom: true,
        customized: false,
        hero13: calculateHero13(macros.protein, macros.fiber, macros.fat, macros.calories, macros.gl, 100),
        satietyPer100kcal: (() => {
          const C = macros.calories;
          if (C <= 0) return 0;
          const factor = 100 / C;
          const s = calculateSatietyScore(100, 100 * factor, macros.protein * factor, macros.fiber * factor);
          return Math.round(s * 10) / 10;
        })(),
      };
    }
  }

  return result;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ─── Food Logs ────────────────────────────────────────────────────────────

  app.get(api.logs.list.path, async (req, res) => {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ message: "Date required" });
    const logs = await storage.getLogs(date);
    res.json(logs);
  });

  app.post(api.logs.create.path, async (req, res) => {
    try {
      const input = api.logs.create.input.parse(req.body);
      const date = input.date || new Date().toISOString().split('T')[0];
      const log = await storage.createLog(input.boxId, input.grams, date, input.meal || 'breakfast');
      res.status(201).json(log);
    } catch (err) {
      res.status(400).json({ message: "Invalid log data" });
    }
  });

  app.delete('/api/logs/:id', async (req, res) => {
    try {
      await storage.deleteLog(Number(req.params.id));
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  app.post(api.logs.reset.path, async (req, res) => {
    try {
      const { date } = api.logs.reset.input.parse(req.body);
      await storage.resetLogs(date);
      await storage.resetCustomLogs(date);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.get(api.logs.getDailyRecord.path, async (req, res) => {
    const record = await storage.getDailyRecord(req.params.date);
    res.json(record || null);
  });

  app.post(api.logs.saveDay.path, async (req, res) => {
    try {
      const input = api.logs.saveDay.input.parse(req.body);
      await storage.saveDay(input.date, input.logs, input.weightG, input.activeMeal, input.points ?? 0);
      res.json({ success: true });
    } catch (err) {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.get(api.logs.getRange.path, async (req, res) => {
    const start = req.query.start as string;
    const end = req.query.end as string;
    const data = await storage.getRangeData(start, end);
    res.json(data);
  });

  app.get(api.logs.lastWeight.path, async (req, res) => {
    const weightG = await storage.getLastWeight();
    res.json({ weightG });
  });

  app.get('/api/points/:date', async (req, res) => {
    const points = await storage.getPoints(req.params.date);
    res.json({ points });
  });

  app.post('/api/logs/reset-box', async (req, res) => {
    try {
      const { boxId, date } = z.object({ boxId: z.number(), date: z.string() }).parse(req.body);
      await storage.resetBoxLogs(boxId, date);
      res.json({ success: true });
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // ─── Food Search ──────────────────────────────────────────────────────────

  app.get('/api/food-search', async (req, res) => {
    const query = req.query.q as string;
    if (!query || query.length < 2) return res.json([]);
    try {
      const results = await searchUSDA(query);
      res.json(results);
    } catch {
      res.json([]);
    }
  });

  // ─── Custom Logs ──────────────────────────────────────────────────────────

  app.get('/api/custom-logs', async (req, res) => {
    const date = req.query.date as string;
    if (!date) return res.status(400).json({ message: "Date required" });
    const logs = await storage.getCustomLogs(date);
    res.json(logs);
  });

  app.post('/api/custom-logs', async (req, res) => {
    try {
      const input = z.object({
        foodName: z.string(),
        grams: z.number(),
        calories: z.number(),
        protein: z.number(),
        fiber: z.number(),
        fat: z.number(),
        gl: z.number(),
        meal: z.string(),
        date: z.string(),
      }).parse(req.body);
      const log = await storage.createCustomLog(input);
      res.status(201).json(log);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete('/api/custom-logs/:id', async (req, res) => {
    try {
      await storage.deleteCustomLog(Number(req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  // ─── Menu Ingredients ─────────────────────────────────────────────────────

  app.get('/api/menu-ingredients', async (req, res) => {
    const meal = req.query.meal as string;
    if (!meal) return res.status(400).json({ message: "Meal required" });
    const ingredients = await storage.getMenuIngredients(meal);
    res.json(ingredients);
  });

  app.post('/api/menu-ingredients', async (req, res) => {
    try {
      const { meal, name } = z.object({ meal: z.string(), name: z.string().min(1) }).parse(req.body);
      const ingredient = await storage.addMenuIngredient(meal, name);
      res.status(201).json(ingredient);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  app.delete('/api/menu-ingredients/:id', async (req, res) => {
    try {
      await storage.deleteMenuIngredient(Number(req.params.id));
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete" });
    }
  });

  // ─── Meal Criteria ────────────────────────────────────────────────────────

  app.get('/api/meal-criteria/:meal', async (req, res) => {
    const criteria = await storage.getMealCriteria(req.params.meal);
    if (!criteria) return res.status(404).json({ message: "Not found" });
    res.json(criteria);
  });

  app.put('/api/meal-criteria/:meal', async (req, res) => {
    try {
      const data = z.object({
        calories: z.number(),
        protein: z.number(),
        fiber: z.number(),
        fat: z.number(),
        gl: z.number(),
      }).parse(req.body);
      const criteria = await storage.upsertMealCriteria(req.params.meal, data);
      res.json(criteria);
    } catch {
      res.status(400).json({ message: "Invalid data" });
    }
  });

  // ─── Recipe Search (Spoonacular) ──────────────────────────────────────────

  app.get('/api/recipes/search', async (req, res) => {
    const meal = req.query.meal as string;
    const source = (req.query.source as string) || "all";
    const maxGl = req.query.maxGl ? Number(req.query.maxGl) : null;
    if (!meal) return res.status(400).json({ message: "Meal required" });

    const ingredients = await storage.getMenuIngredients(meal);
    if (ingredients.length === 0) return res.status(400).json({ message: "No ingredients for this meal" });

    const criteria = await storage.getMealCriteria(meal);
    const crit = criteria || { calories: 500, protein: 30, fiber: 8, fat: 20, gl: 20 };

    const apiKey = process.env.SPOONACULAR_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ message: "Recipe search is not configured. Please add SPOONACULAR_API_KEY to environment variables." });
    }

    // Site name to add to query when source is selected
    const SITE_LABELS: Record<string, string> = {
      giallozafferano: "giallozafferano",
      cucchiaio: "cucchiaio d'argento",
      lacucinaitaliana: "la cucina italiana",
    };

    try {
      const ingredientList = ingredients.map(i => i.name).join(',');
      let rawRecipes: any[] = [];

      if (source !== "all" && SITE_LABELS[source]) {
        // Use complexSearch with site name in query for source-specific search
        const siteQuery = SITE_LABELS[source] + " italian " + ingredients.map(i => i.name).join(' ');
        const complexUrl = `https://api.spoonacular.com/recipes/complexSearch?apiKey=${apiKey}&query=${encodeURIComponent(siteQuery)}&includeIngredients=${encodeURIComponent(ingredientList)}&cuisine=italian&number=12&addRecipeInformation=true&addRecipeNutrition=true`;
        const complexRes = await fetch(complexUrl);
        if (!complexRes.ok) {
          const err = await complexRes.text();
          return res.status(502).json({ message: `Spoonacular error (${complexRes.status}): ${err}` });
        }
        const complexData: any = await complexRes.json();
        const items: any[] = complexData.results || [];
        if (!items.length) return res.json({ results: [], criteria: crit });

        let results = items.map((info: any) => {
          const nutrients: Record<string, number> = {};
          (info.nutrition?.nutrients || []).forEach((n: any) => { nutrients[n.name] = n.amount; });
          const carbs = nutrients['Carbohydrates'] || 0;
          return {
            id: info.id,
            title: info.title,
            image: info.image || '',
            sourceUrl: info.sourceUrl || '',
            sourceName: info.sourceName || '',
            usedIngredientCount: (info.usedIngredients || []).length,
            missedIngredientCount: (info.missedIngredients || []).length,
            nutrition: {
              calories: Math.round(nutrients['Calories'] || 0),
              protein: Math.round(nutrients['Protein'] || 0),
              fat: Math.round(nutrients['Fat'] || 0),
              fiber: Math.round(nutrients['Fiber'] || 0),
              carbs: Math.round(carbs),
              gl: Math.round(carbs * 0.5),
            },
          };
        });
        if (maxGl !== null) results = results.filter(r => r.nutrition.gl <= maxGl);
        return res.json({ results, criteria: crit });
      }

      // Default: findByIngredients + bulk info
      const searchUrl = `https://api.spoonacular.com/recipes/findByIngredients?apiKey=${apiKey}&ingredients=${encodeURIComponent(ingredientList)}&number=12&ranking=1&ignorePantry=true`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) {
        const err = await searchRes.text();
        return res.status(502).json({ message: `Spoonacular error (${searchRes.status}): ${err}` });
      }
      rawRecipes = await searchRes.json();
      if (!rawRecipes.length) return res.json({ results: [], criteria: crit });

      const recipeIds = rawRecipes.slice(0, 8).map((r: any) => r.id).join(',');
      const infoUrl = `https://api.spoonacular.com/recipes/informationBulk?apiKey=${apiKey}&ids=${recipeIds}&includeNutrition=true`;
      const infoRes = await fetch(infoUrl);
      if (!infoRes.ok) return res.json({ results: [], criteria: crit });

      const infoList: any[] = await infoRes.json();
      let results = infoList.map((info: any) => {
        const raw = rawRecipes.find((r: any) => r.id === info.id) || {};
        const nutrients: Record<string, number> = {};
        (info.nutrition?.nutrients || []).forEach((n: any) => { nutrients[n.name] = n.amount; });
        const carbs = nutrients['Carbohydrates'] || 0;
        return {
          id: info.id,
          title: info.title,
          image: info.image || '',
          sourceUrl: info.sourceUrl || '',
          sourceName: info.sourceName || '',
          usedIngredientCount: raw.usedIngredientCount || 0,
          missedIngredientCount: raw.missedIngredientCount || 0,
          nutrition: {
            calories: Math.round(nutrients['Calories'] || 0),
            protein: Math.round(nutrients['Protein'] || 0),
            fat: Math.round(nutrients['Fat'] || 0),
            fiber: Math.round(nutrients['Fiber'] || 0),
            carbs: Math.round(carbs),
            gl: Math.round(carbs * 0.5),
          },
        };
      });
      if (maxGl !== null) results = results.filter(r => r.nutrition.gl <= maxGl);
      res.json({ results, criteria: crit });
    } catch (err: any) {
      res.status(500).json({ message: `Search failed: ${err.message}` });
    }
  });

  // ─── Box Data (merged static + customizations) ────────────────────────────

  app.get('/api/boxes', async (_req, res) => {
    try {
      const customizations = await storage.getBoxCustomizations();
      const merged = mergeBoxData(customizations);
      res.json(merged);
    } catch {
      res.status(500).json({ message: "Failed to load boxes" });
    }
  });

  // ─── Admin Box Manager ────────────────────────────────────────────────────

  app.get('/api/admin/boxes', async (_req, res) => {
    try {
      const customizations = await storage.getBoxCustomizations();
      const merged = mergeBoxData(customizations);
      const raw = customizations.reduce((acc: any, c: any) => { acc[c.boxId] = c; return acc; }, {});
      const result = Object.values(merged).map((box: any) => ({
        ...box,
        customizationId: raw[box.id]?.id ?? null,
      }));
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to load boxes" });
    }
  });

  app.put('/api/admin/boxes/:id', async (req, res) => {
    try {
      const boxId = Number(req.params.id);
      const data = z.object({
        name: z.string().optional(),
        calories: z.number().optional(),
        protein: z.number().optional(),
        fiber: z.number().optional(),
        fat: z.number().optional(),
        gl: z.number().optional(),
        increment: z.number().optional(),
        examples: z.array(z.string()).optional(),
        group: z.string().optional(),
        hidden: z.boolean().optional(),
      }).parse(req.body);

      const payload: any = { boxId };
      if (data.name !== undefined) payload.name = data.name;
      if (data.calories !== undefined) payload.calories = data.calories;
      if (data.protein !== undefined) payload.protein = data.protein;
      if (data.fiber !== undefined) payload.fiber = data.fiber;
      if (data.fat !== undefined) payload.fat = data.fat;
      if (data.gl !== undefined) payload.gl = data.gl;
      if (data.increment !== undefined) payload.increment = data.increment;
      if (data.examples !== undefined) payload.examples = JSON.stringify(data.examples);
      if (data.group !== undefined) payload.group = data.group;
      if (data.hidden !== undefined) payload.hidden = data.hidden ? 1 : 0;

      // Preserve isCustom flag for existing custom boxes
      const existing = await storage.getBoxCustomization(boxId);
      if (existing) payload.isCustom = existing.isCustom;

      await storage.upsertBoxCustomization(payload);
      const customizations = await storage.getBoxCustomizations();
      const merged = mergeBoxData(customizations);
      res.json(merged[boxId] || null);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid data" });
    }
  });

  app.post('/api/admin/boxes', async (req, res) => {
    try {
      const data = z.object({
        name: z.string().min(1),
        calories: z.number(),
        protein: z.number(),
        fiber: z.number(),
        fat: z.number(),
        gl: z.number(),
        increment: z.number().default(10),
        examples: z.array(z.string()).default([]),
        group: z.enum(['matrix', 'buttons']).default('buttons'),
      }).parse(req.body);

      // Assign a new ID starting from 100
      const customizations = await storage.getBoxCustomizations();
      const customIds = customizations.filter((c: any) => c.isCustom === 1).map((c: any) => c.boxId);
      const nextId = customIds.length > 0 ? Math.max(...customIds) + 1 : 100;

      await storage.upsertBoxCustomization({
        boxId: nextId,
        name: data.name,
        calories: data.calories,
        protein: data.protein,
        fiber: data.fiber,
        fat: data.fat,
        gl: data.gl,
        increment: data.increment,
        examples: JSON.stringify(data.examples),
        group: data.group,
        hidden: 0,
        isCustom: 1,
      });

      const newCustomizations = await storage.getBoxCustomizations();
      const merged = mergeBoxData(newCustomizations);
      res.status(201).json(merged[nextId] || null);
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Invalid data" });
    }
  });

  app.delete('/api/admin/boxes/:id', async (req, res) => {
    try {
      const boxId = Number(req.params.id);
      if (BOX_DATA[boxId]) {
        // Built-in: just hide it
        const existing = await storage.getBoxCustomization(boxId);
        await storage.upsertBoxCustomization({
          ...(existing || {}),
          boxId,
          hidden: 1,
          isCustom: 0,
        });
      } else {
        // Custom: hard delete
        await storage.deleteBoxCustomization(boxId);
      }
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to delete box" });
    }
  });

  app.post('/api/admin/boxes/:id/restore', async (req, res) => {
    try {
      const boxId = Number(req.params.id);
      await storage.deleteBoxCustomization(boxId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ message: "Failed to restore box" });
    }
  });

  return httpServer;
}
