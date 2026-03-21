import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl, type CreateLogRequest } from "@shared/routes";
import { type FoodLog, type BoxDefinition } from "@shared/schema";

// Helper to format date as YYYY-MM-DD using LOCAL time (not UTC)
// toISOString() returns UTC, which differs from local date at night in UTC- timezones,
// causing the query cache key to mismatch Dashboard's dateStr → invalidation never triggers.
const formatDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export function useLogs(date: Date) {
  const dateStr = formatDate(date);
  
  return useQuery({
    queryKey: [api.logs.list.path, dateStr],
    queryFn: async () => {
      // Use URLSearchParams directly if buildUrl doesn't support query params elegantly
      // But let's follow the pattern if buildUrl is strictly for path params
      // api.logs.list.path is /api/logs
      const url = `${api.logs.list.path}?date=${dateStr}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch logs");
      return api.logs.list.responses[200].parse(await res.json());
    },
  });
}

export function useCreateLog() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: CreateLogRequest) => {
      const res = await fetch(api.logs.create.path, {
        method: api.logs.create.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      
      if (!res.ok) {
        if (res.status === 400) {
          const error = api.logs.create.responses[400].parse(await res.json());
          throw new Error(error.message);
        }
        throw new Error("Failed to create log");
      }
      
      return api.logs.create.responses[201].parse(await res.json());
    },
    // Invalidate the specific date's query
    onSuccess: (_, variables) => {
      const dateStr = variables.date || formatDate(new Date());
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path, dateStr] });
    },
  });
}

export function useDeleteLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const url = buildUrl(api.logs.delete.path, { id });
      const res = await fetch(url, { 
        method: api.logs.delete.method,
        credentials: "include"
      });
      
      if (!res.ok && res.status !== 404) {
        throw new Error("Failed to delete log");
      }
    },
    onSuccess: () => {
      // Invalidate all log queries to be safe, or we could pass date context
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path] });
    },
  });
}

export function useResetDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (date: Date) => {
      const dateStr = formatDate(date);
      const res = await fetch(api.logs.reset.path, {
        method: api.logs.reset.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr }),
        credentials: "include",
      });
      
      if (!res.ok) throw new Error("Failed to reset logs");
      return res.json();
    },
    onSuccess: (_, date) => {
      const dateStr = formatDate(date);
      queryClient.invalidateQueries({ queryKey: [api.logs.list.path, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['/api/custom-logs', dateStr] });
    },
  });
}
