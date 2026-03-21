import { useMemo } from "react";
import Big from "big.js";
import { type FoodLog, type CustomFoodLog, type MealType, MEAL_TARGETS, calculateHero13, calculateSatietyScore } from "@shared/schema";
import { useBoxData } from "@/hooks/use-box-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface TotalsPanelProps {
  logs: FoodLog[];
  activeMeal: MealType;
  mealLogs: FoodLog[];
  customLogs?: CustomFoodLog[];
}

interface MacroTotal {
  calories: Big;
  protein: Big;
  fiber: Big;
  fat: Big;
  gl: Big;
  weight: Big;
}

function computeTotals(logsList: FoodLog[], boxData: ReturnType<typeof useBoxData>) {
  const sum: MacroTotal = {
    calories: Big(0),
    protein: Big(0),
    fiber: Big(0),
    fat: Big(0),
    gl: Big(0),
    weight: Big(0),
  };

  logsList.forEach(log => {
    const box = boxData[log.boxId];
    if (!box) return;
    const factor = Big(log.grams).div(100);
    sum.weight = sum.weight.plus(Big(log.grams));
    sum.calories = sum.calories.plus(Big(box.macros.calories).times(factor));
    sum.protein = sum.protein.plus(Big(box.macros.protein).times(factor));
    sum.fiber = sum.fiber.plus(Big(box.macros.fiber).times(factor));
    sum.fat = sum.fat.plus(Big(box.macros.fat).times(factor));
    sum.gl = sum.gl.plus(Big(box.macros.gl).times(factor));
  });

  const weightNum = sum.weight.toNumber();
  const caloriesNum = sum.calories.toNumber();
  const proteinNum = sum.protein.toNumber();
  const fiberNum = sum.fiber.toNumber();
  const fatNum = sum.fat.toNumber();
  const glNum = sum.gl.toNumber();

  const hero13Val = (caloriesNum > 0 && weightNum > 0)
    ? calculateHero13(proteinNum, fiberNum, fatNum, caloriesNum, glNum, weightNum)
    : null;
  const satietyVal = (caloriesNum > 0 && weightNum > 0)
    ? calculateSatietyScore(caloriesNum, weightNum, proteinNum, fiberNum)
    : null;

  return {
    calories: sum.calories.round(0).toNumber(),
    protein: sum.protein.round(1).toNumber(),
    fiber: sum.fiber.round(1).toNumber(),
    fat: sum.fat.round(1).toNumber(),
    gl: sum.gl.round(1).toNumber(),
    weight: sum.weight.round(0).toNumber(),
    hero13: hero13Val,
    satiety: satietyVal,
  };
}

export function TotalsPanel({ logs, activeMeal, mealLogs, customLogs = [] }: TotalsPanelProps) {
  const boxData = useBoxData();
  const dayTotals = useMemo(() => {
    const boxTotals = computeTotals(logs, boxData);
    customLogs.forEach(cl => {
      boxTotals.calories += cl.calories;
      boxTotals.protein += cl.protein;
      boxTotals.fiber += cl.fiber;
      boxTotals.fat += cl.fat;
      boxTotals.gl += cl.gl;
      boxTotals.weight += cl.grams;
    });
    const c = boxTotals.calories;
    const w = boxTotals.weight;
    boxTotals.hero13 = (c > 0 && w > 0) ? calculateHero13(boxTotals.protein, boxTotals.fiber, boxTotals.fat, c, boxTotals.gl, w) : null;
    boxTotals.satiety = (c > 0 && w > 0) ? calculateSatietyScore(c, w, boxTotals.protein, boxTotals.fiber) : null;
    return boxTotals;
  }, [logs, customLogs, boxData]);

  return (
    <Card className="h-full border-none shadow-none bg-transparent">
      <CardHeader className="pb-2 px-0">
        <CardTitle className="text-xl font-bold tracking-tight text-foreground/80">Daily Summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 px-0">
        
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col items-center" data-testid="daily-calories">
          <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Total Calories</span>
          <span className="text-5xl font-mono font-bold text-primary mt-2">{dayTotals.calories}</span>
          <span className="text-xs text-muted-foreground mt-1">kcal</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <MacroCard label="Protein" value={dayTotals.protein} unit="g" color="bg-blue-500" />
          <MacroCard label="Fiber" value={dayTotals.fiber} unit="g" color="bg-green-500" />
          <MacroCard label="Fat" value={dayTotals.fat} unit="g" color="bg-yellow-500" />
          <MacroCard label="GL" value={dayTotals.gl} unit="" color="bg-pink-500" />
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex justify-between items-center gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Satiety / 100kcal</span>
              <span className="text-xs text-muted-foreground">Volume + protein + fiber density</span>
            </div>
            <span className="text-xl font-bold font-mono" data-testid="text-satiety">
              {dayTotals.satiety !== null ? dayTotals.satiety.toFixed(1) : "\u2014"}
            </span>
          </div>
          <Progress value={dayTotals.satiety ?? 0} className="h-2" />
          
          <div className="flex justify-between items-center gap-2">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Hero13 Index</span>
              <span className="text-xs text-muted-foreground">Composite metric</span>
            </div>
            <span className="text-xl font-bold font-mono" data-testid="text-hero13">
              {dayTotals.hero13 !== null ? dayTotals.hero13 : "\u2014"}
            </span>
          </div>
          <Progress value={dayTotals.hero13 ?? 0} className="h-2" />
        </div>

      </CardContent>
    </Card>
  );
}

function MacroCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between h-20 relative overflow-hidden" data-testid={`macro-${label.toLowerCase()}`}>
      <div className={`absolute top-0 left-0 w-1 h-full ${color}`} />
      <span className="text-xs font-medium text-muted-foreground pl-2">{label}</span>
      <div className="flex items-baseline gap-1 mt-auto pl-2">
        <span className="text-2xl font-bold font-mono">{value}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
