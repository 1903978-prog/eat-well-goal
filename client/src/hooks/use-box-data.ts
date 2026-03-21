import { useQuery } from "@tanstack/react-query";
import { BOX_DATA, type BoxDefinition } from "@shared/schema";

export type BoxData = Record<number, BoxDefinition & { hidden?: boolean; isCustom?: boolean; customized?: boolean }>;

export function useBoxData(): BoxData {
  const { data } = useQuery<BoxData>({
    queryKey: ['/api/boxes'],
    queryFn: async () => {
      const res = await fetch('/api/boxes', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load boxes');
      return res.json();
    },
    staleTime: 60_000,
  });

  // While loading, fall back to static BOX_DATA
  return data ?? (BOX_DATA as BoxData);
}

/** Returns only visible boxes */
export function useVisibleBoxData(): BoxData {
  const all = useBoxData();
  return Object.fromEntries(
    Object.entries(all).filter(([, box]) => !box.hidden)
  ) as BoxData;
}
