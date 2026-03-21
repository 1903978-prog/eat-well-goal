import { useState, useMemo, useEffect } from "react";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, RotateCcw, Trash2, Calendar as CalendarIcon, Loader2, Save, BarChart3, UtensilsCrossed, X, Trophy, ChefHat } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";

import Big from "big.js";
import { BOX_DATA, MEAL_TARGETS, CAL_THRESHOLD, GL_THRESHOLD, SIDEBAR_ORDER, calculateHero13, type MealType, type CustomFoodLog } from "@shared/schema";
import { useLogs, useCreateLog, useResetDay, useDeleteLog } from "@/hooks/use-logs";
import { BoxButton } from "@/components/BoxButton";
import { TotalsPanel } from "@/components/TotalsPanel";
import { FoodSearch } from "@/components/FoodSearch";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const MEALS: MealType[] = ["breakfast", "lunch", "snack", "dinner"];
type ViewMode = MealType | "fullday";
const VIEW_MODES: ViewMode[] = ["breakfast", "lunch", "snack", "dinner", "fullday"];
const VIEW_LABELS: Record<ViewMode, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  snack: "Snack",
  dinner: "Dinner",
  fullday: "Full Day",
};

export default function Dashboard() {
  const [date, setDate] = useState<Date>(new Date());
  const [activeMeal, setActiveMeal] = useState<MealType>("breakfast");
  const [viewMode, setViewMode] = useState<ViewMode>("breakfast");
  const [weightG, setWeightG] = useState<number | null>(null);
  const [weightInitialized, setWeightInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customFoodsOpen, setCustomFoodsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { data: logs, isLoading, error } = useLogs(date);
  const dateStr = format(date, 'yyyy-MM-dd');
  const { data: customLogs } = useQuery<CustomFoodLog[]>({
    queryKey: ['/api/custom-logs', dateStr],
    queryFn: async () => {
      const res = await fetch(`/api/custom-logs?date=${dateStr}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
  const createLog = useCreateLog();
  const resetDay = useResetDay();
  const deleteLog = useDeleteLog();
  const { toast } = useToast();

  const qc = useQueryClient();

  const prevDateStr = format(subDays(date, 1), 'yyyy-MM-dd');
  const { data: prevPointsData } = useQuery<{ points: number }>({
    queryKey: ['/api/points', prevDateStr],
    queryFn: async () => {
      const res = await fetch(`/api/points/${prevDateStr}`);
      if (!res.ok) return { points: 0 };
      return res.json();
    },
  });

  const { data: lastWeightData } = useQuery({
    queryKey: ['/api/weight/last'],
  });

  useEffect(() => {
    if (weightInitialized) return;
    if (lastWeightData) {
      setWeightG((lastWeightData as { weightG: number | null }).weightG ?? 82500);
      setWeightInitialized(true);
    }
  }, [lastWeightData, weightInitialized]);

  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate) setDate(newDate);
  };

  const cycleMeal = (direction: 1 | -1) => {
    const idx = VIEW_MODES.indexOf(viewMode);
    const next = (idx + direction + VIEW_MODES.length) % VIEW_MODES.length;
    const nextMode = VIEW_MODES[next];
    setViewMode(nextMode);
    if (nextMode !== "fullday") {
      setActiveMeal(nextMode);
    }
  };

  const adjustWeight = (delta: number) => {
    setWeightG(prev => {
      const next = (prev ?? 82500) + delta;
      return Math.max(30000, Math.min(250000, next));
    });
  };

  const handleLog = (boxId: number) => {
    const box = BOX_DATA[boxId];
    if (!box) return;
    createLog.mutate(
      { boxId, grams: box.increment, meal: activeMeal, date: dateStr },
      {
        onError: () => {
          toast({ variant: "destructive", title: "Error", description: "Failed to log entry." });
        }
      }
    );
  };

  const handleResetBox = async (boxId: number) => {
    try {
      const res = await fetch('/api/logs/reset-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boxId, date: dateStr }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Server error');
      queryClient.invalidateQueries({ queryKey: ['/api/logs', dateStr] });
    } catch (err) {
      console.error('Reset box error:', err);
      toast({ variant: "destructive", title: "Error", description: "Failed to reset box." });
    }
  };

  const handleDeleteCustomLog = async (id: number) => {
    try {
      await fetch(`/api/custom-logs/${id}`, { method: 'DELETE', credentials: 'include' });
      queryClient.invalidateQueries({ queryKey: ['/api/custom-logs', dateStr] });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to delete." });
    }
  };

  const handleSave = async () => {
    if (!logs) return;
    setSaving(true);
    try {
      const saveLogs = logs.map(l => ({ boxId: l.boxId, grams: l.grams, meal: l.meal }));
      await apiRequest('POST', '/api/logs/save', {
        date: dateStr,
        logs: saveLogs,
        weightG,
        activeMeal,
        points: currentPoints,
      });
      qc.invalidateQueries({ queryKey: ['/api/weight/last'] });
      qc.invalidateQueries({ queryKey: ['/api/logs/range'] });
      qc.invalidateQueries({ queryKey: ['/api/points'] });
      toast({ title: "Saved", description: "Today's data has been saved." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to save." });
    }
    setSaving(false);
  };

  const handleReset = () => {
    resetDay.mutate(date, {
      onSuccess: () => {
        toast({ title: "Reset Complete", description: "All logs cleared." });
      }
    });
  };

  const handleUndo = () => {
    if (!logs || logs.length === 0) return;
    const lastLog = [...logs].sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )[0];
    deleteLog.mutate({ id: lastLog.id }, {
      onSuccess: () => {
        toast({ title: "Undone", description: "Last entry removed." });
      }
    });
  };

  const activeMealLogs = useMemo(() => {
    if (viewMode === "fullday") return logs || [];
    return logs?.filter(l => l.meal === activeMeal) || [];
  }, [logs, activeMeal, viewMode]);

  const boxCounts = activeMealLogs.reduce((acc, log) => {
    acc[log.boxId] = (acc[log.boxId] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  const boxTotals = activeMealLogs.reduce((acc, log) => {
    acc[log.boxId] = (acc[log.boxId] || 0) + log.grams;
    return acc;
  }, {} as Record<number, number>);

  const boxAlerts = useMemo(() => {
    if (!logs) return {} as Record<number, boolean>;
    let totalCal = 0;
    let totalGL = 0;
    for (const log of logs) {
      const box = BOX_DATA[log.boxId];
      if (!box) continue;
      const f = log.grams / 100;
      totalCal += box.macros.calories * f;
      totalGL += box.macros.gl * f;
    }
    (customLogs || []).forEach(cl => {
      totalCal += cl.calories;
      totalGL += cl.gl;
    });
    const alerts: Record<number, boolean> = {};
    for (let id = 1; id <= 18; id++) {
      alerts[id] = totalCal > (CAL_THRESHOLD[id] ?? Infinity) || totalGL > (GL_THRESHOLD[id] ?? Infinity);
    }
    return alerts;
  }, [logs, customLogs]);

  const dailyTotalsForPoints = useMemo(() => {
    let totalCal = 0, totalP = 0, totalF = 0, totalFat = 0, totalGl = 0, totalW = 0;
    (logs || []).forEach(log => {
      const box = BOX_DATA[log.boxId];
      if (!box) return;
      const f = log.grams / 100;
      totalCal += box.macros.calories * f;
      totalP += box.macros.protein * f;
      totalF += box.macros.fiber * f;
      totalFat += box.macros.fat * f;
      totalGl += box.macros.gl * f;
      totalW += log.grams;
    });
    (customLogs || []).forEach(cl => {
      totalCal += cl.calories;
      totalP += cl.protein;
      totalF += cl.fiber;
      totalFat += cl.fat;
      totalGl += cl.gl;
      totalW += cl.grams;
    });
    const hero13 = (totalCal > 0 && totalW > 0) ? calculateHero13(totalP, totalF, totalFat, totalCal, totalGl, totalW) : 0;
    return { calories: totalCal, hero13 };
  }, [logs, customLogs]);

  const currentPoints = useMemo(() => {
    const prevPts = prevPointsData?.points ?? 0;
    const { calories, hero13 } = dailyTotalsForPoints;
    if (calories > 1550) return 0;
    let earned = 0;
    if (calories > 0 && calories < 1550) earned += 10;
    if (calories > 0 && hero13 < 70) earned += 3;
    return prevPts + earned;
  }, [dailyTotalsForPoints, prevPointsData]);

  const activeMealCustomLogs = useMemo(() => {
    if (viewMode === "fullday") return customLogs || [];
    return (customLogs || []).filter(cl => cl.meal === activeMeal);
  }, [customLogs, activeMeal, viewMode]);

  const mealTotals = useMemo(() => {
    const sum = { calories: Big(0), protein: Big(0), fiber: Big(0), weight: Big(0) };
    activeMealLogs.forEach(log => {
      const box = BOX_DATA[log.boxId];
      if (!box) return;
      const f = Big(log.grams).div(100);
      sum.weight = sum.weight.plus(Big(log.grams));
      sum.calories = sum.calories.plus(Big(box.macros.calories).times(f));
      sum.protein = sum.protein.plus(Big(box.macros.protein).times(f));
      sum.fiber = sum.fiber.plus(Big(box.macros.fiber).times(f));
    });
    activeMealCustomLogs.forEach(cl => {
      sum.weight = sum.weight.plus(Big(cl.grams));
      sum.calories = sum.calories.plus(Big(cl.calories));
      sum.protein = sum.protein.plus(Big(cl.protein));
      sum.fiber = sum.fiber.plus(Big(cl.fiber));
    });
    return {
      calories: sum.calories.round(0).toNumber(),
      protein: sum.protein.round(1).toNumber(),
      fiber: sum.fiber.round(1).toNumber(),
      weight: sum.weight.round(0).toNumber(),
    };
  }, [activeMealLogs, activeMealCustomLogs]);

  const gridBoxIds = [7, 8, 9, 4, 5, 6, 1, 2, 3];
  const gridBoxes = gridBoxIds.map(id => BOX_DATA[id]);
  const sidebarBoxes = SIDEBAR_ORDER.map(id => BOX_DATA[id]);
  const targets = viewMode === "fullday"
    ? MEALS.reduce((sum, m) => ({
        calories: sum.calories + MEAL_TARGETS[m].calories,
        protein: sum.protein + MEAL_TARGETS[m].protein,
        fiber: sum.fiber + MEAL_TARGETS[m].fiber,
        weight: sum.weight + MEAL_TARGETS[m].weight,
      }), { calories: 0, protein: 0, fiber: 0, weight: 0 })
    : MEAL_TARGETS[activeMeal];
  const weightKg = weightG !== null ? (weightG / 1000).toFixed(1) : "--";

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-red-50 text-red-600" data-testid="error-container">
        <div className="text-center">
          <h2 className="text-2xl font-bold">Error loading dashboard</h2>
          <p>{error.message}</p>
          <Button onClick={() => window.location.reload()} className="mt-4" variant="outline" data-testid="button-retry">Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-foreground font-sans selection:bg-primary/20">
      <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-border/40">
        <div className="container max-w-7xl mx-auto px-3 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold text-sm">
              E
            </div>
            <h1 className="font-bold text-sm tracking-tight hidden sm:block">Eat Well</h1>
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold font-mono border",
                currentPoints > 0
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-slate-50 text-slate-400 border-slate-200"
              )}
              title={`Score: ${currentPoints} pts`}
              data-testid="text-points-score"
            >
              <Trophy className="h-3 w-3" />
              {currentPoints}
            </div>
          </div>

          <div className="flex items-center gap-1 bg-slate-100/50 p-0.5 rounded-full border border-slate-200/60">
            <Button variant="ghost" size="icon" onClick={() => setDate(subDays(date, 1))} data-testid="button-prev-day">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-date-picker">
                  <CalendarIcon className="mr-1.5 h-3 w-3 opacity-70" />
                  {format(date, "EEE, MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar mode="single" selected={date} onSelect={handleDateChange} initialFocus />
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))} data-testid="button-next-day">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handleUndo} disabled={!logs?.length || deleteLog.isPending} title="Undo" data-testid="button-undo">
              <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" disabled={!logs?.length} title="Reset Day" data-testid="button-reset">
                  <Trash2 className="h-3.5 w-3.5 text-destructive/70" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Daily Log?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all food entries for {format(date, "MMMM do")}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground">Reset All</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="default" size="sm" onClick={handleSave} disabled={saving || isLoading} data-testid="button-save">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "..." : "Save"}
            </Button>
            <Link href="/progress">
              <Button variant="outline" size="icon" title="Progress" data-testid="button-progress">
                <BarChart3 className="h-3.5 w-3.5" />
              </Button>
            </Link>
            <Link href="/menus">
              <Button variant="outline" size="icon" title="Menus" data-testid="button-menus">
                <ChefHat className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="sticky top-12 z-20 w-full bg-white/90 backdrop-blur-sm border-b border-border/30">
        <div className="container max-w-7xl mx-auto px-3 py-1.5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1" data-testid="meal-selector">
            <Button variant="ghost" size="icon" onClick={() => cycleMeal(-1)} data-testid="button-prev-meal">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="font-semibold text-xs min-w-[80px] text-center" data-testid="text-active-meal">
              {VIEW_LABELS[viewMode]}
            </span>
            <Button variant="ghost" size="icon" onClick={() => cycleMeal(1)} data-testid="button-next-meal">
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground" data-testid="meal-targets">
            <span>C:{targets.calories}</span>
            <span>P:{targets.protein}g</span>
            <span>F:{targets.fiber}g</span>
            <span>W:{targets.weight}g</span>
          </div>

          <div className="flex items-center gap-1" data-testid="weight-stepper">
            <Button variant="ghost" size="icon" onClick={() => adjustWeight(-100)} data-testid="button-weight-down">
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <span className="font-mono text-xs font-semibold min-w-[52px] text-center" data-testid="text-weight">
              {weightKg} kg
            </span>
            <Button variant="ghost" size="icon" onClick={() => adjustWeight(100)} data-testid="button-weight-up">
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <main className="container max-w-7xl mx-auto px-3 py-3">
        {isLoading ? (
          <div className="flex h-[60vh] items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-primary/30" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
            <div className="lg:col-span-2 order-2 lg:order-1">
              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Add-ons</h3>
                <div className="grid grid-cols-4 lg:grid-cols-1 gap-1.5">
                  {sidebarBoxes.map(box => (
                    <BoxButton key={box.id} box={box} variant="sidebar" count={boxCounts[box.id] || 0} totalGrams={boxTotals[box.id] || 0} onLog={() => handleLog(box.id)} onReset={() => handleResetBox(box.id)} alert={boxAlerts[box.id] || false} />
                  ))}
                  <button
                    onClick={() => setCustomFoodsOpen(true)}
                    className={cn(
                      "h-16 w-full p-2 rounded-lg border flex flex-col items-center justify-center transition-all duration-200 shadow-sm hover-elevate",
                      (customLogs || []).length > 0 ? "border-[3px] !border-purple-500 bg-purple-50 text-purple-800" : "border-slate-200 text-slate-700"
                    )}
                    data-testid="button-custom-foods"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 mb-0.5 opacity-70" />
                    <span className="text-[11px] font-bold leading-tight">Custom</span>
                    <span className="text-xs font-mono font-semibold opacity-90">{(customLogs || []).length} items</span>
                  </button>
                </div>
              </div>

              <Dialog open={customFoodsOpen} onOpenChange={setCustomFoodsOpen}>
                <DialogContent className="sm:max-w-[420px]">
                  <DialogHeader>
                    <DialogTitle className="text-lg">Custom Foods</DialogTitle>
                    <DialogDescription>Foods added via search for {format(date, 'MMM d, yyyy')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto py-2">
                    {(customLogs || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No custom foods logged yet. Use the search box to add foods.</p>
                    ) : (
                      (customLogs || []).map(cl => (
                        <div key={cl.id} className="flex items-center gap-2 p-2.5 rounded-md border border-slate-200" data-testid={`custom-food-item-${cl.id}`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{cl.foodName}</div>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                              {cl.grams}g | {cl.calories} cal | P:{cl.protein}g | F:{cl.fiber}g | Fat:{cl.fat}g | GL:{cl.gl}
                            </div>
                            <div className="text-[9px] text-muted-foreground/60 uppercase mt-0.5">{cl.meal}</div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteCustomLog(cl.id)}
                            data-testid={`button-delete-custom-${cl.id}`}
                          >
                            <X className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="lg:col-span-7 order-1 lg:order-2">
              <div className="space-y-2">
                <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Primary Foods</h3>
                <div className="grid grid-cols-3 gap-1.5" style={{ gridTemplateRows: 'repeat(3, 1fr)', height: 'calc(8 * 4rem + 7 * 0.375rem)' }}>
                  {gridBoxes.map(box => (
                    <BoxButton key={box.id} box={box} variant="matrix" count={boxCounts[box.id] || 0} totalGrams={boxTotals[box.id] || 0} onLog={() => handleLog(box.id)} onReset={() => handleResetBox(box.id)} alert={boxAlerts[box.id] || false} />
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-3 order-4 lg:order-3 lg:row-span-2">
              <div className="lg:sticky lg:top-28 space-y-3">
                <TotalsPanel logs={logs || []} activeMeal={activeMeal} mealLogs={activeMealLogs} customLogs={customLogs || []} />
                <FoodSearch date={dateStr} meal={activeMeal} />
              </div>
            </div>

            <div className="lg:col-span-9 order-3 lg:order-4">
              <div className="grid grid-cols-4 gap-1.5" data-testid="meal-vs-target">
                <MealDeltaCard label="Calories" actual={mealTotals.calories} target={targets.calories} unit=" kcal" />
                <MealDeltaCard label="Protein" actual={mealTotals.protein} target={targets.protein} unit="g" />
                <MealDeltaCard label="Fiber" actual={mealTotals.fiber} target={targets.fiber} unit="g" />
                <MealDeltaCard label="Weight" actual={mealTotals.weight} target={targets.weight} unit="g" />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MealDeltaCard({ label, actual, target, unit }: { label: string; actual: number; target: number; unit: string }) {
  const delta = Math.round(actual - target);
  const sign = delta >= 0 ? "+" : "";
  return (
    <div className="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm" data-testid={`meal-delta-${label.toLowerCase()}`}>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="flex items-baseline justify-between gap-1 mt-1">
        <span className="text-sm font-mono font-semibold">{Math.round(actual)}</span>
        <span className={cn(
          "text-xs font-mono font-medium",
          delta > 0 ? "text-orange-600" : delta < 0 ? "text-blue-600" : "text-green-600"
        )}>
          {sign}{delta}{unit}
        </span>
      </div>
    </div>
  );
}
