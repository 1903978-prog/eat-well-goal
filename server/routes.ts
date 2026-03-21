import { Express, Request, Response } from "express";
import { storage } from "./storage";
import { insertHoldingSchema } from "@shared/schema";

export function registerRoutes(app: Express) {
  // Holdings CRUD
  app.get("/api/holdings", async (_req, res) => {
    try {
      const data = await storage.getHoldings();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch holdings" });
    }
  });

  app.post("/api/holdings", async (req: Request, res: Response) => {
    try {
      const parsed = insertHoldingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error });
      const holding = await storage.upsertHolding(parsed.data);
      res.json(holding);
    } catch (err) {
      res.status(500).json({ error: "Failed to save holding" });
    }
  });

  app.put("/api/holdings/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const holding = await storage.upsertHolding({ ...req.body, id });
      res.json(holding);
    } catch (err) {
      res.status(500).json({ error: "Failed to update holding" });
    }
  });

  app.delete("/api/holdings/:id", async (req: Request, res: Response) => {
    try {
      await storage.deleteHolding(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to delete holding" });
    }
  });

  app.post("/api/holdings/replace", async (req: Request, res: Response) => {
    try {
      const result = await storage.replaceAllHoldings(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Failed to replace holdings" });
    }
  });

  // Settings
  app.get("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      const value = await storage.getSetting(req.params.key);
      res.json({ value });
    } catch (err) {
      res.status(500).json({ error: "Failed to get setting" });
    }
  });

  app.post("/api/settings/:key", async (req: Request, res: Response) => {
    try {
      await storage.setSetting(req.params.key, req.body.value);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to save setting" });
    }
  });
}
