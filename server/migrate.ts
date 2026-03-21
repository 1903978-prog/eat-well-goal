/**
 * Lightweight startup migration: ensures all required tables exist.
 * Uses CREATE TABLE IF NOT EXISTS so it is safe to run on every startup.
 */
import { pool } from "./db";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS food_logs (
        id         SERIAL PRIMARY KEY,
        box_id     INTEGER NOT NULL,
        grams      INTEGER NOT NULL,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        date       DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS daily_records (
        date         DATE PRIMARY KEY,
        weight_g     INTEGER,
        active_meal  TEXT NOT NULL DEFAULT 'breakfast',
        saved_at_iso TIMESTAMP DEFAULT NOW(),
        version      INTEGER NOT NULL DEFAULT 2,
        points       INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS custom_food_logs (
        id         SERIAL PRIMARY KEY,
        food_name  TEXT NOT NULL,
        grams      INTEGER NOT NULL,
        calories   INTEGER NOT NULL,
        protein    INTEGER NOT NULL,
        fiber      INTEGER NOT NULL,
        fat        INTEGER NOT NULL,
        gl         INTEGER NOT NULL,
        meal       TEXT NOT NULL DEFAULT 'breakfast',
        date       DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS menu_ingredients (
        id         SERIAL PRIMARY KEY,
        meal       TEXT NOT NULL,
        name       TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS meal_criteria (
        meal     TEXT PRIMARY KEY,
        calories INTEGER NOT NULL DEFAULT 500,
        protein  INTEGER NOT NULL DEFAULT 30,
        fiber    INTEGER NOT NULL DEFAULT 8,
        fat      INTEGER NOT NULL DEFAULT 20,
        gl       INTEGER NOT NULL DEFAULT 20
      );

      CREATE TABLE IF NOT EXISTS box_customizations (
        id         SERIAL PRIMARY KEY,
        box_id     INTEGER NOT NULL UNIQUE,
        name       TEXT,
        calories   INTEGER,
        protein    INTEGER,
        fiber      INTEGER,
        fat        INTEGER,
        gl         INTEGER,
        increment  INTEGER,
        examples   TEXT,
        "group"    TEXT,
        hidden     INTEGER NOT NULL DEFAULT 0,
        is_custom  INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[migrate] All tables verified/created.");
  } finally {
    client.release();
  }
}
