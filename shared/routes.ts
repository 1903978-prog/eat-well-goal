
import { z } from 'zod';
import { dailyRecords, foodLogs } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export type CreateLogRequest = {
  boxId: number;
  grams: number;
  meal?: string;
  date?: string;
};

export const api = {
  logs: {
    list: {
      method: 'GET' as const,
      path: '/api/logs' as const,
      input: z.object({
        date: z.string().optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof foodLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/logs' as const,
      input: z.object({
        boxId: z.number(),
        grams: z.number(),
        meal: z.string().optional(),
        date: z.string().optional(),
      }),
      responses: {
        201: z.custom<typeof foodLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/logs/:id' as const,
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    reset: {
      method: 'POST' as const,
      path: '/api/logs/reset' as const,
      input: z.object({
        date: z.string(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
      },
    },
    saveDay: {
      method: 'POST' as const,
      path: '/api/logs/save' as const,
      input: z.object({
        date: z.string(),
        logs: z.array(z.object({
          boxId: z.number(),
          grams: z.number(),
          meal: z.string(),
        })),
        weightG: z.number().nullable(),
        activeMeal: z.string(),
        points: z.number().optional(),
      }),
      responses: {
        200: z.object({ success: z.boolean() }),
        400: errorSchemas.validation,
      },
    },
    getDailyRecord: {
      method: 'GET' as const,
      path: '/api/daily-records/:date' as const,
      responses: {
        200: z.custom<typeof dailyRecords.$inferSelect>().nullable(),
      },
    },
    getRange: {
      method: 'GET' as const,
      path: '/api/logs/range' as const,
      input: z.object({
        start: z.string(),
        end: z.string(),
      }),
      responses: {
        200: z.array(z.object({
          date: z.string(),
          weightG: z.number().nullable(),
          calories: z.number(),
          hero13: z.number(),
        })),
      },
    },
    lastWeight: {
      method: 'GET' as const,
      path: '/api/weight/last' as const,
      responses: {
        200: z.object({ weightG: z.number().nullable() }),
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
