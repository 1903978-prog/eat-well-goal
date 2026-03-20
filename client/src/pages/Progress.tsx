import { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type WindowKey = "7d" | "14d" | "30d";

const WINDOWS: { key: WindowKey; label: string; days: number }[] = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "14d", label: "14 days", days: 14 },
  { key: "30d", label: "30 days", days: 30 },
];

export default function Progress() {
  const [window, setWindow] = useState<WindowKey>("7d");
  const days = WINDOWS.find(w => w.key === window)!.days;

  const today = format(new Date(), "yyyy-MM-dd");
  const startDate = format(subDays(new Date(), days - 1), "yyyy-MM-dd");

  const { data: rangeData, isLoading } = useQuery<{ date: string; weightG: number | null; calories: number; hero13: number }[]>({
    queryKey: [`/api/logs/range?start=${startDate}&end=${today}`],
  });

  const chartData = useMemo(() => {
    if (!rangeData) return [];
    return rangeData.map(d => ({
      date: format(new Date(d.date + "T00:00:00"), "MMM d"),
      hero13: d.hero13,
      calories: d.calories,
      weightKg: d.weightG !== null ? d.weightG / 1000 : null,
    }));
  }, [rangeData]);

  const summary = useMemo(() => {
    if (!rangeData || rangeData.length === 0) return null;
    const daysWithData = rangeData.filter(d => d.calories > 0);
    const avgHero13 = daysWithData.length > 0
      ? Math.round(daysWithData.reduce((s, d) => s + d.hero13, 0) / daysWithData.length)
      : 0;
    const avgCals = daysWithData.length > 0
      ? Math.round(daysWithData.reduce((s, d) => s + d.calories, 0) / daysWithData.length)
      : 0;
    const weights = rangeData.filter(d => d.weightG !== null);
    const weightChange = weights.length >= 2
      ? ((weights[weights.length - 1].weightG! - weights[0].weightG!) / 1000).toFixed(1)
      : null;
    return { avgHero13, avgCals, weightChange, daysLogged: daysWithData.length };
  }, [rangeData]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-foreground font-sans">
      <header className="sticky top-0 z-30 w-full bg-white/80 backdrop-blur-md border-b border-border/40">
        <div className="container max-w-4xl mx-auto px-4 h-12 flex items-center justify-between gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </Link>
          <h1 className="font-bold text-sm">Progress</h1>
          <div className="flex gap-1" data-testid="window-selector">
            {WINDOWS.map(w => (
              <Button
                key={w.key}
                variant={window === w.key ? "default" : "outline"}
                size="sm"
                onClick={() => setWindow(w.key)}
                data-testid={`button-window-${w.key}`}
              >
                {w.label}
              </Button>
            ))}
          </div>
        </div>
      </header>

      <main className="container max-w-4xl mx-auto px-4 py-6 space-y-6">
        {isLoading ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">Loading...</div>
        ) : (
          <>
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="summary-row">
                <SummaryCard label="Avg Hero13" value={String(summary.avgHero13)} />
                <SummaryCard label="Avg Calories" value={`${summary.avgCals} kcal`} />
                <SummaryCard label="Days Logged" value={String(summary.daysLogged)} />
                <SummaryCard label="Weight Change" value={summary.weightChange !== null ? `${summary.weightChange} kg` : "\u2014"} />
              </div>
            )}

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Hero13 Index</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="hero13" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Daily Calories</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="calories" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Weight (kg)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={chartData.filter(d => d.weightKg !== null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="weightKg" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 flex flex-col items-center">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</span>
        <span className="text-lg font-bold font-mono mt-1" data-testid={`summary-${label.toLowerCase().replace(/\s/g, '-')}`}>{value}</span>
      </CardContent>
    </Card>
  );
}
