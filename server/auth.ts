import type { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import MemoryStore from "memorystore";

const MemStore = MemoryStore(session);

export function setupAuth(app: Express) {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "eat-well-goal-secret-change-me",
      resave: false,
      saveUninitialized: false,
      store: new MemStore({ checkPeriod: 86400000 }),
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: "lax",
      },
    })
  );

  app.post("/api/auth/login", (req: Request, res: Response) => {
    const { password } = req.body;
    const appPassword = process.env.APP_PASSWORD;

    if (!appPassword) {
      // No password set — open access
      (req.session as any).authenticated = true;
      return res.json({ ok: true });
    }

    if (password === appPassword) {
      (req.session as any).authenticated = true;
      return res.json({ ok: true });
    }

    return res.status(401).json({ ok: false, message: "Invalid password" });
  });

  app.get("/api/auth/check", (req: Request, res: Response) => {
    const appPassword = process.env.APP_PASSWORD;
    if (!appPassword || (req.session as any).authenticated) {
      return res.json({ authenticated: true });
    }
    return res.status(401).json({ authenticated: false });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword || (req.session as any).authenticated) {
    return next();
  }
  // Allow auth endpoints through
  if (req.path.startsWith("/api/auth/")) {
    return next();
  }
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}
