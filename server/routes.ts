
import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";

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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

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

  return httpServer;
}
